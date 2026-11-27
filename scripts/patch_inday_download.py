"""Rewrite the notebook's download cell so it is safe to re-run.

Running cell 0 again used to re-download 4 GB. It now skips a complete local
model, falls back to the public mirror when no HF token is set, and rejects a
truncated file before the loader ever sees it.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NB = ROOT / "seallm" / "SariSwerte_INDAY_standalone.ipynb"

CELL0 = '''import os
import sys
import subprocess

subprocess.run(
    [sys.executable, "-m", "pip", "install", "-q", "-U", "huggingface_hub"],
    check=True,
)

from huggingface_hub import hf_hub_download

# Ang bucket ni boss. Private ito, kaya kailangan ng HF_TOKEN — pero may
# public mirror na eksaktong pareho ang file, para makapag-test kahit wala.
PRIVATE_REPO = "Rexmay/SeaLLM-7B-v2-gguf-bucket"
PUBLIC_REPO = "SeaLLMs/SeaLLM-7B-v2-gguf"
FILES = [
    "SeaLLM-7B-v2.q4_0.gguf",   # ang model (4-bit)
    "seallm.preset.json",        # prompt format
]
LOCAL_DIR = os.environ.get("SEALLM_DIR", "./seallm")
os.makedirs(LOCAL_DIR, exist_ok=True)

GGUF = os.path.join(LOCAL_DIR, "SeaLLM-7B-v2.q4_0.gguf")
MIN_BYTES = 3 * 1024 ** 3


def _read_env_file(path="./.env"):
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def _complete(path):
    """A GGUF starts with the magic bytes; a truncated download does not end well."""
    if not os.path.exists(path) or os.path.getsize(path) < MIN_BYTES:
        return False
    with open(path, "rb") as fh:
        return fh.read(4) == b"GGUF"


HF_TOKEN = os.environ.get("HF_TOKEN", "").strip() or _read_env_file().get("HF_TOKEN", "").strip()
REPO_ID = os.environ.get("SEALLM_REPO_ID", "").strip()

if _complete(GGUF):
    print(f"✅ Nandiyan na ang model ({os.path.getsize(GGUF) / 1024 ** 3:.2f} GB). "
          "Laktawan ang download.")
else:
    # Walang token = subukan ang public mirror. May token = gamitin ang bucket ni boss.
    if not REPO_ID:
        REPO_ID = PRIVATE_REPO if HF_TOKEN else PUBLIC_REPO
    if REPO_ID == PUBLIC_REPO and not HF_TOKEN:
        print(f"ℹ️ Walang HF_TOKEN, kaya public mirror ang gagamitin: {PUBLIC_REPO}")
        print("   Pareho ito ng file sa bucket ni boss. Para sa private bucket, "
              "lagyan ng HF_TOKEN ang .env.")

    for fname in FILES:
        try:
            path = hf_hub_download(
                repo_id=REPO_ID,
                filename=fname,
                local_dir=LOCAL_DIR,
                token=HF_TOKEN or None,
            )
        except Exception as exc:
            raise SystemExit(
                f"Hindi ma-download ang {fname} mula sa {REPO_ID}.\\n"
                f"Dahilan: {exc}\\n"
                "Kung 401/403 ito, private ang bucket — lagyan ng HF_TOKEN ang .env "
                "at tiyaking may access ang account mo.\\n"
                "Walang token? Patakbuhin ulit nang walang HF_TOKEN para gamitin "
                f"ang public mirror ({PUBLIC_REPO})."
            ) from exc
        print("Na-download:", path)

if not _complete(GGUF):
    raise SystemExit(
        f"Sira o kulang ang {GGUF} ({os.path.getsize(GGUF) / 1024 ** 3:.2f} GB). "
        "Burahin ito at patakbuhin ulit ang cell."
    )
print(f"✅ Model OK: {os.path.getsize(GGUF) / 1024 ** 3:.2f} GB, valid GGUF.")
'''


def main():
    nb = json.loads(NB.read_text(encoding="utf-8"))
    nb["cells"][0]["source"] = CELL0.splitlines(keepends=True)
    nb["cells"][0]["outputs"] = []
    nb["cells"][0]["execution_count"] = None
    NB.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
    print("cell 0 rewritten:", len(CELL0), "chars")


if __name__ == "__main__":
    main()
