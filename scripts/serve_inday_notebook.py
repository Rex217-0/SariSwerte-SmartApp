"""Serve the real notebook API and drive the real React app against it.

This is the end-to-end proof: the browser talks to SeaLLM over HTTP, INDAY
speaks the answer, and the HUD must read SEALLM ONLINE rather than BRAIN OFFLINE.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NB = ROOT / "seallm" / "SariSwerte_INDAY_standalone.ipynb"
PORT = 8000

BOOT = r'''
import json, os, sys
from pathlib import Path
nb = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
cells = ["".join(c["source"]) for c in nb["cells"]]
os.environ.setdefault("SELLER_TOKEN", "test-seller-token-0123456789")
g = {"__name__": "__main__"}
for i in (2, 3):
    exec(compile(cells[i], f"<cell{i}>", "exec"), g)
import uvicorn
uvicorn.run(g["app"], host="127.0.0.1", port=int(sys.argv[2]), log_level="warning")
'''


def wait_health(timeout=420):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(3)
    return None


def post(path, payload, headers=None):
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def main():
    boot = Path("/tmp/boot_nb.py")
    boot.write_text(BOOT, encoding="utf-8")
    log = open("/tmp/boot_nb.log", "w")
    proc = subprocess.Popen([sys.executable, str(boot), str(NB), str(PORT)],
                            cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    try:
        health = wait_health()
        if not health:
            print("SERVER DID NOT START")
            print(Path("/tmp/boot_nb.log").read_text()[-3000:])
            return 1
        print("HEALTH:", json.dumps(health, ensure_ascii=False))

        token = os.environ.get("SELLER_TOKEN", "test-seller-token-0123456789")
        seller = {"X-Seller-Token": token}
        post("/reset", {}, seller)
        for s in ["mulai", "SariSwerte", "Inday", "FB Live", "5000", "1000", "50",
                  "500", "7-day return kung may sira"]:
            post("/v1/chat/completions", {"messages": [{"role": "user", "content": s}]}, seller)
        post("/v1/chat/completions",
             {"messages": [{"role": "user", "content": "ADD: Coke 1.5L | 65 | 75 | 20 | bote"}]},
             seller)
        post("/v1/chat/completions",
             {"messages": [{"role": "user", "content": "AI ikaw na"}]}, seller)
        print("SETUP + TAKE OVER: done")

        Path("/tmp/live_ready").write_text("ok")

        # Keep serving while the browser test runs.
        while True:
            time.sleep(2)
            if proc.poll() is not None:
                print("server exited")
                return 1
    finally:
        proc.terminate()
        log.close()


if __name__ == "__main__":
    sys.exit(main())
