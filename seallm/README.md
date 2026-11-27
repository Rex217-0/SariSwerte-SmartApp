# SeaLLM worker (standalone)

The notebook in this folder is INDAY's brain. It downloads the quantised
SeaLLM model from the operator's own Hugging Face bucket, serves it over an
OpenAI-compatible `/v1/chat/completions` endpoint, and exposes it through a
Cloudflare quick tunnel so the web app can reach it.

Nothing here is tied to Kaggle: paths are relative to the notebook, secrets
come from a `.env` file, and the Convai story blocks are embedded in cell 3.
The notebook is one self-contained file.

## Setup

```bash
cp seallm/.env.example seallm/.env
# then edit seallm/.env
```

`.env` needs two values:

| Key | Why |
|---|---|
| `HF_TOKEN` | `Rexmay/SeaLLM-7B-v2-gguf-bucket` is a **private** bucket, so the download needs a token that has access to it. Set `SEALLM_REPO_ID=SeaLLMs/SeaLLM-7B-v2-gguf` to pull the identical public file instead, with no token. |
| `SELLER_TOKEN` | Guards the seller-only commands (`ADD`, `SELL`, `AI ikaw na`, `ako na`). Minimum 16 characters. |

## Run

Open `SariSwerte_INDAY_standalone.ipynb` and run the cells in order:

0. Download the GGUF into `./seallm/`
1. Install `llama-cpp-python` and the web deps
2. Store state, math and the selling logic
3. SeaLLM load + story blocks + FastAPI app
4. Start the server and the Cloudflare tunnel — it prints the public URL
5. Reset, set up the shop, and run the smoke test

Paste the printed tunnel URL into the app's Brain settings. The app probes
`/health` and talks to `/v1/chat/completions`, sending the seller token as both
`X-Seller-Token` and `Authorization: Bearer`.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Model, agent, Convai character id and block count. |
| `GET /story` | The 15 story blocks as JSON. |
| `POST /v1/chat/completions` | OpenAI-compatible chat. Accepts `story_block` so INDAY answers inside the right Convai scene. |
| `POST /math`, `POST /tts`, `POST /generate_sales_pitch` | Arithmetic, speech, and seller-only copy. |

Blocks 12 and 13 (barangay and supplier contacts) are terminal in Convai, so
they have no outgoing decisions; every block has an objective.

## Division of labour

- **SeaLLM** (this notebook) is the brain: prices, stock, arithmetic, replies.
- **Convai** (`src/inday/convai/`) supplies INDAY's persona, story blocks 1-15
  and voice metadata. It is not re-created here.
- **`public/models/INDAY_Avatar.glb`** is the face. No paid pixel streaming.
