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

Regenerate after editing the avatar in Convai:

```bash
export CONVAI_API_KEY=...     # or place the key in ~/.convai_key
python3 scripts/sync-convai-inday.py
```

The key is read from the environment or `~/.convai_key`, is never printed, and
is gitignored.
