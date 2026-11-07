"""Instagram reel kapak görsellerini covers/ klasörüne indirir.

Kullanım:  python3 covers_fetch.py         (eksik kapakları indirir)
           python3 covers_fetch.py --all   (hepsini yeniden indirir)
server.py kayıt sonrasında eksik kapakları otomatik indirir.
"""
import html
import json
import re
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
COVERS = ROOT / "covers"
UA = {"User-Agent": "Mozilla/5.0"}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{5,40}$")


def _get(url: str) -> bytes:
    # curl macOS sistem sertifikalarını kullanır (python.org Python'unda SSL sertifikası eksik olabiliyor)
    return subprocess.run(["curl", "-sfL", "--max-time", "20", "-A", UA["User-Agent"], url], capture_output=True, check=True).stdout


def fetch_cover(rid: str, force: bool = False) -> bool:
    if not ID_RE.match(rid):
        return False
    out = COVERS / f"{rid}.jpg"
    if out.exists() and not force:
        return True
    page = _get(f"https://www.instagram.com/reel/{rid}/embed/").decode("utf-8", "ignore")
    m = re.search(r'class="EmbeddedMediaImage"[^>]*?src="([^"]+)"', page)
    if not m:
        return False
    url = html.unescape(m.group(1))
    img = _get(url)
    if len(img) < 2000:
        return False
    COVERS.mkdir(exist_ok=True)
    out.write_bytes(img)
    return True


def fetch_missing(data: dict, force: bool = False) -> tuple[int, int]:
    ok = bad = 0
    for b in data.get("brands", []):
        for rid in b.get("reels", []):
            try:
                ok += fetch_cover(rid, force)
            except Exception as e:  # ağ hatası vb.
                print("kapak alınamadı:", rid, e)
                bad += 1
    return ok, bad


if __name__ == "__main__":
    d = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    print("tamam / hata:", fetch_missing(d, "--all" in sys.argv))
