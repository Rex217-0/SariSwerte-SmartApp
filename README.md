# SariSwerte-SmartApp
The Micro enterprenuer live web app

## INDAY comes from Convai

INDAY is not a persona written for this app. She is the operator's own Convai
avatar (`9a6d5a76-19b0-4b66-bc2e-d76e13e85795`), and her narrative is imported
from Convai rather than invented here:

- `src/inday/convai/inday-story.ts` holds all 15 story blocks, the decision
  graph, the personality traits and the voice metadata, copied verbatim from the
  Convai character API.
- Convai's `start_section_id` points at block 5 (Utang at GCash), so the app
  opens there. Blocks 1-4 are reachable through the decision graph.
- The SeaLLM system prompt is assembled from the active block's `objective`
  text, and the HUD shows `BLOCK n/15`.

## The brain is a standalone SeaLLM notebook

`seallm/SariSwerte_INDAY_standalone.ipynb` is INDAY's brain. It downloads the
quantised SeaLLM from the operator's own private bucket
(`Rexmay/SeaLLM-7B-v2-gguf-bucket`), serves it with llama-cpp-python behind an
OpenAI-compatible `/v1/chat/completions`, and publishes it through a Cloudflare
quick tunnel. Nothing depends on Kaggle: every path is relative to the notebook
and both secrets come from `seallm/.env` (see `seallm/README.md`).

The app probes `/health` and sends the seller token as `X-Seller-Token` and
`Authorization: Bearer`, so the same token unlocks the seller-only commands.

Who does what:

| Layer | Source | Cost |
|---|---|---|
| Brain | SeaLLM in `seallm/` | free, local |
| Persona, voice, story 1-15 | Convai avatar INDAY | existing plan |
| Face | `public/models/SariSwerte_INDAY.glb` | free, GLB only |

There is no MetaPerson and no paid pixel streaming.

Regenerate after editing the avatar in Convai:

```bash
export CONVAI_API_KEY=...     # or place the key in ~/.convai_key
python3 scripts/sync-convai-inday.py
```

The key is read from the environment or `~/.convai_key`, is never printed, and
is gitignored.
