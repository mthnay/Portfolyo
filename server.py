#!/usr/bin/env python3
"""Portfolyo sunucusu + yönetim paneli API'si.

Bilgisayarda:   python3 server.py
                Site:  http://localhost:5173
                Panel: http://localhost:5173/admin/

Render'da (Web Service):
    Start command:  python3 server.py
    Ortam değişkenleri:
        GITHUB_TOKEN   – depoya yazma izni olan token (Contents: Read and write)
        GITHUB_REPO    – "kullanici/depo" biçiminde
        GITHUB_BRANCH  – (isteğe bağlı) varsayılan: main
    Render PORT değişkenini kendisi verir; sunucu o zaman herkese açık dinler.

Render'ın diski kalıcı değildir; bu yüzden panelde yapılan her kayıt
(data.json, yüklenen logolar, reel kapakları, şifre) GitHub deposuna da
yazılır. Böylece sunucu yeniden başlasa da hiçbir şey kaybolmaz.
"""
import base64
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import shutil
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data.json"
LOGOS = ROOT / "logos"
BACKUPS = ROOT / "backups"
AUTH = ROOT / "auth.json"          # panel şifresinin özeti (şifrenin kendisi saklanmaz)
DEFAULT_PASSWORD = "7213"
KEEP_BACKUPS = 50

ON_SERVER = "PORT" in os.environ   # Render (veya başka bir barındırma) PORT verir
PORT = int(os.environ.get("PORT", 5173))
HOST = "0.0.0.0" if ON_SERVER else "127.0.0.1"

GH_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GH_REPO = os.environ.get("GITHUB_REPO", "").strip()
GH_BRANCH = os.environ.get("GITHUB_BRANCH", "main").strip() or "main"

TOKENS: dict[str, float] = {}      # açık oturumlar -> son kullanım zamanı
SESSION_TTL = 12 * 3600
FAILS: dict[str, list[float]] = {} # IP -> yanlış giriş zamanları
MAX_FAILS, FAIL_WINDOW = 5, 300    # 5 dakikada 5 yanlış denemeden sonra bekletir

# Dışarıya asla verilmeyecek dosyalar / klasörler
BLOCKED = re.compile(r"^/(auth\.json|backups/|\.git|\.env|.*\.py$|.*\.pyc$|__pycache__/)", re.I)


# ---------------- GitHub senkronizasyonu ----------------
_gh_q: "queue.Queue[tuple[str, str]]" = queue.Queue()
GH_STATUS = {"enabled": bool(GH_TOKEN and GH_REPO), "last": None, "error": None, "pending": 0}


def _gh(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GH_REPO}/contents/{path}" + (f"?ref={GH_BRANCH}" if method == "GET" else ""),
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {GH_TOKEN}", "Accept": "application/vnd.github+json",
                 "User-Agent": "portfolio-panel", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def _gh_put_file(rel: str, message: str) -> None:
    content = (ROOT / rel).read_bytes()
    sha = None
    try:
        cur = _gh("GET", rel)
        sha = cur.get("sha")
        if cur.get("content") and base64.b64decode(cur["content"]) == content:
            return  # değişmemiş
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    body = {"message": message, "content": base64.b64encode(content).decode(), "branch": GH_BRANCH}
    if sha:
        body["sha"] = sha
    _gh("PUT", rel, body)


def _gh_worker():
    while True:
        rel, msg = _gh_q.get()
        for attempt in range(3):
            try:
                _gh_put_file(rel, msg)
                GH_STATUS.update(last=datetime.now().isoformat(timespec="seconds"), error=None)
                break
            except Exception as e:  # noqa: BLE001
                GH_STATUS["error"] = f"{rel}: {e}"
                print("GitHub'a yazılamadı:", rel, e)
                time.sleep(2 + attempt * 3)
        GH_STATUS["pending"] = _gh_q.qsize()


def sync(*rels: str, msg: str = "Panelden güncellendi") -> None:
    """Dosyaları GitHub'a gönder ([skip render] ile gereksiz yeniden yayın tetiklenmez)."""
    if not GH_STATUS["enabled"]:
        return
    for rel in rels:
        _gh_q.put((rel, f"{msg} [skip render]"))
    GH_STATUS["pending"] = _gh_q.qsize()


# ---------------- Şifre ----------------
def _hash(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()


def set_password(pw: str) -> None:
    salt = secrets.token_hex(16)
    AUTH.write_text(json.dumps({"salt": salt, "hash": _hash(pw, salt)}), encoding="utf-8")
    sync("auth.json", msg="Panel şifresi değişti")


def check_password(pw: str) -> bool:
    if not AUTH.exists():
        set_password(DEFAULT_PASSWORD)
    a = json.loads(AUTH.read_text(encoding="utf-8"))
    return hmac.compare_digest(_hash(pw, a["salt"]), a["hash"])


def validate(d):
    if not isinstance(d, dict):
        raise ValueError("Veri bir nesne olmalı")
    if not isinstance(d.get("settings"), dict):
        raise ValueError("settings eksik")
    if not isinstance(d.get("brands"), list):
        raise ValueError("brands bir liste olmalı")
    if not isinstance(d.get("customFields", []), list):
        raise ValueError("customFields bir liste olmalı")
    keys = set()
    for b in d["brands"]:
        k = b.get("key")
        if not k or not isinstance(k, str):
            raise ValueError(f"'{b.get('title', '?')}' markasının anahtarı yok")
        if k in keys:
            raise ValueError(f"Aynı anahtar iki kez kullanılmış: {k}")
        keys.add(k)
        for f in ("youtube", "reels"):
            if not isinstance(b.get(f, []), list):
                raise ValueError(f"{k}.{f} bir liste olmalı")


def fetch_covers_and_sync(data: dict) -> None:
    try:
        import covers_fetch
        before = set(p.name for p in (ROOT / "covers").glob("*.jpg")) if (ROOT / "covers").exists() else set()
        covers_fetch.fetch_missing(data)
        after = set(p.name for p in (ROOT / "covers").glob("*.jpg")) if (ROOT / "covers").exists() else set()
        sync(*[f"covers/{n}" for n in sorted(after - before)], msg="Reel kapakları eklendi")
    except Exception as e:  # noqa: BLE001
        print("kapak indirme hatası:", e)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        if not ON_SERVER or self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def end_headers(self):
        p = urlparse(self.path).path
        # Site dosyaları kısa süre önbelleğe alınabilir; veri ve panel her zaman taze
        if p.startswith(("/covers/", "/logos/")):
            self.send_header("Cache-Control", "public, max-age=86400")
        else:
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _ip(self) -> str:
        return (self.headers.get("X-Forwarded-For", "").split(",")[0].strip() or self.client_address[0])

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 2 * 1024 * 1024:
            raise ValueError("İstek çok büyük")
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def _authed(self) -> bool:
        tok = self.headers.get("X-Auth", "")
        now = time.time()
        if tok and tok in TOKENS and now - TOKENS[tok] < SESSION_TTL:
            TOKENS[tok] = now
            return True
        TOKENS.pop(tok, None)
        self._json(401, {"error": "Oturum gerekli"})
        return False

    def _new_token(self) -> str:
        tok = secrets.token_urlsafe(24)
        TOKENS[tok] = time.time()
        return tok

    # ---------- GET ----------
    def do_GET(self):
        p = urlparse(self.path).path
        if BLOCKED.match(p):
            return self._json(404, {"error": "Bulunamadı"})
        if p.startswith("/api/"):
            if not self._authed():
                return
            if p == "/api/backups":
                files = sorted(BACKUPS.glob("data-*.json"), reverse=True) if BACKUPS.exists() else []
                return self._json(200, [f.name for f in files])
            if p == "/api/status":
                return self._json(200, {"github": GH_STATUS, "online": ON_SERVER})
            return self._json(404, {"error": "Bulunamadı"})
        return super().do_GET()

    def do_HEAD(self):
        if BLOCKED.match(urlparse(self.path).path):
            return self._json(404, {"error": "Bulunamadı"})
        return super().do_HEAD()

    # ---------- PUT ----------
    def do_PUT(self):
        if self.path != "/api/data":
            return self._json(404, {"error": "Bulunamadı"})
        if not self._authed():
            return
        try:
            data = self._body_json()
            validate(data)
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": str(e)})

        BACKUPS.mkdir(exist_ok=True)
        if DATA.exists():
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            shutil.copy2(DATA, BACKUPS / f"data-{stamp}.json")
            for old in sorted(BACKUPS.glob("data-*.json"))[:-KEEP_BACKUPS]:
                old.unlink()
        tmp = DATA.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(DATA)
        # Kullanılan logoları da garantiye al (yüklenip henüz gönderilmemiş olabilir)
        logos = [b["logo"] for b in data["brands"] if isinstance(b.get("logo"), str) and b["logo"].startswith("logos/") and (ROOT / b["logo"]).exists()]
        sync("data.json", *logos, msg="İçerik güncellendi")
        threading.Thread(target=fetch_covers_and_sync, args=(data,), daemon=True).start()
        return self._json(200, {"ok": True, "savedAt": datetime.now().isoformat(timespec="seconds"),
                                "github": GH_STATUS["enabled"]})

    # ---------- POST ----------
    def do_POST(self):
        p = urlparse(self.path)
        if p.path == "/api/login":
            ip, now = self._ip(), time.time()
            recent = [t for t in FAILS.get(ip, []) if now - t < FAIL_WINDOW]
            if len(recent) >= MAX_FAILS:
                wait = int(FAIL_WINDOW - (now - recent[0])) + 1
                return self._json(429, {"error": f"Çok fazla yanlış deneme. {wait} saniye sonra tekrar deneyin."})
            try:
                pw = str(self._body_json().get("password", ""))
            except Exception:
                pw = ""
            if not check_password(pw):
                recent.append(now)
                FAILS[ip] = recent
                time.sleep(0.6)
                return self._json(401, {"error": "Şifre yanlış"})
            FAILS.pop(ip, None)
            return self._json(200, {"ok": True, "token": self._new_token()})
        if not self._authed():
            return
        if p.path == "/api/logout":
            TOKENS.pop(self.headers.get("X-Auth", ""), None)
            return self._json(200, {"ok": True})
        if p.path == "/api/password":
            try:
                b = self._body_json()
            except Exception:
                return self._json(400, {"error": "Geçersiz istek"})
            if not check_password(str(b.get("current", ""))):
                return self._json(400, {"error": "Mevcut şifre yanlış"})
            new = str(b.get("new", ""))
            if len(new) < 4:
                return self._json(400, {"error": "Yeni şifre en az 4 karakter olmalı"})
            set_password(new)
            TOKENS.clear()
            return self._json(200, {"ok": True, "token": self._new_token()})
        # /api/upload?name=dosya.png  (gövde: ham dosya)
        if p.path == "/api/upload":
            name = parse_qs(p.query).get("name", [""])[0]
            ext = Path(name).suffix.lower()
            if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
                return self._json(400, {"error": "Sadece PNG, JPG, WEBP, SVG, GIF"})
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 5 * 1024 * 1024:
                return self._json(400, {"error": "Dosya 5 MB'tan küçük olmalı"})
            stem = re.sub(r"[^a-z0-9-]+", "-", Path(name).stem.lower()).strip("-") or "logo"
            LOGOS.mkdir(exist_ok=True)
            out = LOGOS / f"{stem}-{int(time.time())}{ext}"
            out.write_bytes(self.rfile.read(length))
            sync(f"logos/{out.name}", msg="Logo yüklendi")
            return self._json(200, {"ok": True, "path": f"logos/{out.name}"})
        # /api/restore?name=data-....json
        if p.path == "/api/restore":
            name = parse_qs(p.query).get("name", [""])[0]
            src = BACKUPS / Path(name).name
            if not src.exists():
                return self._json(404, {"error": "Yedek bulunamadı"})
            shutil.copy2(src, DATA)
            sync("data.json", msg="Yedek geri yüklendi")
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "Bulunamadı"})


if __name__ == "__main__":
    if GH_STATUS["enabled"]:
        threading.Thread(target=_gh_worker, daemon=True).start()
    if ON_SERVER and not GH_STATUS["enabled"]:
        print("UYARI: GITHUB_TOKEN / GITHUB_REPO tanımlı değil — paneldeki kayıtlar sunucu yeniden başlayınca kaybolur!")
    where = f"http://localhost:{PORT}" if not ON_SERVER else f"0.0.0.0:{PORT}"
    print(f"Site:  {where}\nPanel: {where}/admin/  (GitHub senkronu: {'açık' if GH_STATUS['enabled'] else 'kapalı'})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
