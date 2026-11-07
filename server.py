#!/usr/bin/env python3
"""Yerel portfolyo sunucusu + yönetim paneli API'si.

Çalıştırma:  python3 server.py
Site:        http://localhost:5173
Panel:       http://localhost:5173/admin/

Yalnızca bu bilgisayardan (127.0.0.1) erişilebilir. Her kayıtta eski
data.json, backups/ klasörüne tarih damgasıyla yedeklenir.
"""
import json
import shutil
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data.json"
BACKUPS = ROOT / "backups"
PORT = 5173
KEEP_BACKUPS = 50


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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/backups"):
            files = sorted(BACKUPS.glob("data-*.json"), reverse=True) if BACKUPS.exists() else []
            return self._json(200, [f.name for f in files])
        if self.path.startswith("/backups/") or self.path.endswith(".py"):
            return self._json(404, {"error": "Bulunamadı"})
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/data":
            return self._json(404, {"error": "Bulunamadı"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
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
        return self._json(200, {"ok": True, "savedAt": datetime.now().isoformat(timespec="seconds")})

    def do_POST(self):
        # /api/restore?name=data-....json
        if self.path.startswith("/api/restore"):
            from urllib.parse import parse_qs, urlparse
            name = parse_qs(urlparse(self.path).query).get("name", [""])[0]
            src = BACKUPS / Path(name).name
            if not src.exists():
                return self._json(404, {"error": "Yedek bulunamadı"})
            shutil.copy2(src, DATA)
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "Bulunamadı"})


if __name__ == "__main__":
    print(f"Site:  http://localhost:{PORT}\nPanel: http://localhost:{PORT}/admin/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
