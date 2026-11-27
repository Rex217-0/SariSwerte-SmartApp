#!/usr/bin/env python3
"""Re-import INDAY's story blocks from the operator's own Convai avatar.

Nothing is authored here: the script only copies what the Convai character API
returns into src/inday/convai/inday-story.ts, so the app always mirrors the
avatar instead of inventing a persona.

Usage:
    export CONVAI_API_KEY=...        # or put the key in ~/.convai_key
    python3 scripts/sync-convai-inday.py

The key is read from the environment or ~/.convai_key and is never written to
the repository or printed.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

API = "https://api.convai.com"
CHARACTER_ID = "9a6d5a76-19b0-4b66-bc2e-d76e13e85795"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "inday" / "convai" / "inday-story.ts"


def api_key() -> str:
    key = os.environ.get("CONVAI_API_KEY", "").strip()
    if key:
        return key
    key_file = Path.home() / ".convai_key"
    if key_file.exists():
        return key_file.read_text().strip()
    sys.exit("No Convai key. Set CONVAI_API_KEY or create ~/.convai_key.")


def post(endpoint: str, key: str, payload: dict):
    req = urllib.request.Request(
        f"{API}/{endpoint}",
        data=json.dumps(payload).encode(),
        headers={"CONVAI-API-KEY": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as res:
        return json.loads(res.read().decode())


def block_number(name: str | None) -> int | None:
    m = re.match(r"^\s*(\d+)\b", name or "")
    return int(m.group(1)) if m else None


def main() -> None:
    key = api_key()

    listing = post("character/list", key, {})
    character = next(
        (c for c in listing.get("characters", []) if c.get("character_id") == CHARACTER_ID),
        None,
    )
    if character is None:
        sys.exit(f"Character {CHARACTER_ID} not found on this Convai account.")

    sections = post("character/narrative/list-sections", key, {"character_id": CHARACTER_ID})
    knowledge = post("character/knowledge-bank/list", key, {"character_id": CHARACTER_ID})

    by_id = {s["section_id"]: s for s in sections}
    start_id = character.get("start_narrative_section_id")

    blocks = []
    for s in sections:
        n = block_number(s.get("section_name"))
        if n is None or not (s.get("objective") or "").strip():
            continue
        decisions = []
        for d in sorted(s.get("decisions") or [], key=lambda d: d.get("priority", 99)):
            target = by_id.get(d.get("next_section_id"))
            decisions.append(
                {"when": d.get("criteria"), "goto": block_number(target.get("section_name")) if target else None}
            )
        blocks.append(
            {
                "n": n,
                "name": re.sub(r"^\s*\d+\s*[\.\)]?\s*", "", s["section_name"]).strip(),
                "sectionId": s["section_id"],
                "objective": s["objective"].strip(),
                "decisions": decisions,
            }
        )
    blocks.sort(key=lambda b: b["n"])

    start = next((b["n"] for b in blocks if b["sectionId"] == start_id), blocks[0]["n"])

    meta = character.get("model_details", {}).get("METAHUMAN", {})
    identity = {
        "source": {
            "provider": "convai",
            "character_id": character["character_id"],
            "character_name": character["character_name"],
            "model_type": character.get("model_type", ""),
            "voice_type": character.get("voice_type", ""),
            "language_code": character.get("language_code", ""),
            "avatar_id": meta.get("avatar_id", ""),
            "experience_id": meta.get("experience_id", ""),
            "listing": character.get("listing", ""),
            "start_section_id": start_id or "",
            "is_narrative_driven": bool(character.get("is_narrative_driven")),
        },
        "traits": character.get("character_traits") or {},
        "knowledge_bank": {
            "documents": knowledge.get("pagination", {}).get("total_count", 0),
            "note": "Convai knowledge bank state, copied as-is.",
        },
    }

    header = (
        "// GENERATED from the Convai character API. Do not hand-edit.\n"
        '// Source: the operator\'s Convai avatar "INDAY"\n'
        f"// ({CHARACTER_ID}). Nothing here is invented.\n"
        "// Regenerate with: python3 scripts/sync-convai-inday.py\n\n"
    )
    body = (
        "export interface StoryDecision {\n"
        "  when: string;\n"
        "  goto: number | null;\n"
        "}\n\n"
        "export interface StoryBlock {\n"
        "  n: number;\n"
        "  name: string;\n"
        "  sectionId: string;\n"
        "  objective: string;\n"
        "  decisions: StoryDecision[];\n"
        "}\n\n"
        "export interface IndayIdentity {\n"
        "  source: Record<string, string | boolean>;\n"
        "  traits: {\n"
        "    catch_phrases: string[];\n"
        "    speaking_style: string;\n"
        "    personality_traits: Record<string, number>;\n"
        "  };\n"
        "  knowledge_bank: { documents: number; note: string };\n"
        "}\n\n"
        f"export const INDAY_IDENTITY: IndayIdentity = {json.dumps(identity, indent=2, ensure_ascii=False)};\n\n"
        f"export const STORY_BLOCKS: StoryBlock[] = {json.dumps(blocks, indent=2, ensure_ascii=False)};\n\n"
        "export const STORY_BLOCK_COUNT = STORY_BLOCKS.length;\n\n"
        "export function blockByNumber(n: number): StoryBlock | undefined {\n"
        "  return STORY_BLOCKS.find((b) => b.n === n);\n"
        "}\n\n"
        "/** Block number Convai names as the start of the narrative (its start_section_id). */\n"
        f"export const START_BLOCK_NUMBER = {start};\n\n"
        "export const OPENING_BLOCK = blockByNumber(START_BLOCK_NUMBER)!;\n"
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(header + body, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(blocks)} story blocks, start at block {start}")


if __name__ == "__main__":
    main()
