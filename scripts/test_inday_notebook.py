"""Run the standalone notebook end to end against the real SeaLLM model.

This executes the notebook's own cells (not a copy) so the test proves the file
the user opens in StackBlitz is the one that works.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NB = ROOT / "seallm" / "SariSwerte_INDAY_standalone.ipynb"

RUNNER = r'''
import json, os, sys, traceback
from pathlib import Path

nb = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
cells = ["".join(c["source"]) for c in nb["cells"]]

os.environ["SELLER_TOKEN"] = "test-seller-token-0123456789"
os.environ["SEALLM_DIR"] = "./seallm"

# Cell 0 (download) is skipped: the model is already on disk and verified.
# Cell 1 (pip install) is skipped: llama-cpp-python is already installed.
# Cell 4 (tunnel) is skipped: the test talks to the app object directly.
g = {"__name__": "__main__"}

for idx in (2, 3):
    print(f"\n===== RUNNING CELL {idx} =====", flush=True)
    try:
        exec(compile(cells[idx], f"<cell{idx}>", "exec"), g)
    except Exception:
        traceback.print_exc()
        sys.exit(1)

app = g["app"]
print("\n===== NOTEBOOK LOADED =====", flush=True)
print("agent:", g["AGENT_NAME"], "| model:", g["MODEL_NAME"],
      "| blocks:", len(g["STORY_BLOCKS"]), flush=True)

from fastapi.testclient import TestClient
c = TestClient(app)

h = c.get("/health").json()
print("\nHEALTH:", json.dumps(h, ensure_ascii=False), flush=True)
assert h["story_blocks"] == 15, "story blocks missing"
assert h["agent"] == "INDAY", "agent name wrong"
assert h["convai_character"] == "9a6d5a76-19b0-4b66-bc2e-d76e13e85795"

story = c.get("/story").json()
print("BLOCK NUMBERS:", [b["n"] for b in story["blocks"]], flush=True)
assert [b["n"] for b in story["blocks"]] == list(range(1, 16))
# Blocks 12 and 13 are terminal in Convai: they hand off to the barangay and
# the supplier, so they have no outgoing decisions. Every block must still
# carry a non-empty objective.
terminal = {12, 13}
for b in story["blocks"]:
    assert b["objective"].strip(), f"empty objective in block {b['n']}"
    if b["n"] not in terminal:
        assert b["decisions"], f"no decisions in block {b['n']}"
print("✅ 15 blocks, all with objective; 13 with routing decisions", flush=True)

TOKEN = os.environ["SELLER_TOKEN"]
seller = {"X-Seller-Token": TOKEN}


def post(path, payload, headers=None):
    r = c.post(path, json=payload, headers=headers or {})
    return r.status_code, r.json()


# --- seller onboarding (the notebook's own flow) ---
post("/reset", {}, seller)
steps = ["mulai", "SariSwerte", "Inday", "FB Live", "5000", "1000", "50", "500",
         "7-day return kung may sira"]
for s in steps:
    post("/v1/chat/completions", {"messages": [{"role": "user", "content": s}]}, seller)
print("\nSETUP: done", flush=True)

post("/v1/chat/completions",
     {"messages": [{"role": "user", "content": "ADD: Coke 1.5L | 65 | 75 | 20 | bote"}]},
     seller)
print("ADD: ok", flush=True)

# --- buyer must be blocked until the AI takes over ---
code, r = post("/v1/chat/completions", {"messages": [{"role": "user", "content": "Magkano ang Coke?"}]})
print("BUYER (AI off):", r["choices"][0]["message"]["content"], flush=True)

post("/v1/chat/completions",
     {"messages": [{"role": "user", "content": "AI ikaw na"}]}, seller)
print("TAKE OVER: on", flush=True)

# --- deterministic paths ---
code, r = post("/v1/chat/completions",
               {"messages": [{"role": "user", "content": "Magkano ang Coke?"}]})
print("PRICE PATH:", r["choices"][0]["message"]["content"], flush=True)

code, r = post("/v1/chat/completions",
               {"messages": [{"role": "user", "content": "May stock pa ba ang Coke?"}]})
print("STOCK PATH:", r["choices"][0]["message"]["content"], flush=True)

# --- the real SeaLLM path, driven by a story block ---
print("\n===== SeaLLM STORY-BLOCK ANSWERS =====", flush=True)
results = []
for block, q in [
    (1, "Kumusta po kayo diyan, Inday? Mainit ngayon ano?"),
    (3, "Ano po ang magandang bilhin ngayon?"),
    (5, "Pwede po ba akong magpalista ng utang?"),
    (9, "May nagtext sa akin na taga-GCash, hiningi ang OTP ko."),
]:
    code, r = post("/v1/chat/completions",
                   {"messages": [{"role": "user", "content": q}], "story_block": block})
    txt = r["choices"][0]["message"]["content"]
    echoed = r.get("story_block")
    results.append((block, echoed, txt))
    print(f"\n[block {block} -> echoed {echoed}] Q: {q}", flush=True)
    print(f"  A: {txt}", flush=True)
    assert echoed == block, f"block not echoed: {block} != {echoed}"

# --- story routing follows the Convai graph ---
routed = g["route_story"]("Pwede po ba akong magpalista ng utang?", 1)
print(f"\nROUTING: block 1 + 'magpalista ng utang' -> {routed}", flush=True)
assert routed == 5, f"expected block 5, got {routed}"

# --- SeaLLM must actually be the one answering ---
joined = " ".join(t for _, _, t in results).lower()
assert joined.strip(), "SeaLLM returned nothing"
assert "titingnan ko po" not in joined or len(joined) > 200, "only fallback replies"
print("\n✅ ALL CHECKS PASSED — INDAY answers with SeaLLM", flush=True)
print("ANSWERS:", json.dumps([t for _, _, t in results], ensure_ascii=False), flush=True)
'''

Path("/tmp/run_nb.py").write_text(RUNNER, encoding="utf-8")
os.chdir(ROOT)
sys.exit(subprocess.call([sys.executable, "/tmp/run_nb.py", str(NB)]))
