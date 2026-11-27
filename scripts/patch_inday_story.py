"""Add the Convai Story Blocks 1-15 to the INDAY standalone notebook.

The blocks are read from seallm/inday_story_blocks.json, which is exported from
src/inday/convai/inday-story.ts, so the notebook and the React app cannot drift
apart. The rest of the notebook is left untouched.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NB = ROOT / "seallm" / "SariSwerte_INDAY_standalone.ipynb"
STORY_TS = ROOT / "src" / "inday" / "convai" / "inday-story.ts"

STORY_CODE = '''

# ==========================================================
# STORY BLOCKS 1-15
# Source: Convai character 9a6d5a76-19b0-4b66-bc2e-d76e13e85795,
# embedded below, exported from seallm/inday_story_blocks.json. Same graph
# the React app uses, so both sides route identically.
# ==========================================================
STORY_BLOCKS = json.loads(r"""__BLOCKS__""")
STORY_BY_N = {b["n"]: b for b in STORY_BLOCKS}
CONVAI_CHARACTER_ID = "9a6d5a76-19b0-4b66-bc2e-d76e13e85795"

# Salita na masyadong karaniwan para maging trigger.
_STOP = {
    "sumagot", "nagtanong", "nagbintang", "kung", "ang", "ng", "sa", "na",
    "at", "o", "siya", "ito", "iyon", "para", "daw", "ba", "po", "may",
}


def route_story(text, current_n):
    """Follow the Convai decision graph: first rule whose words appear in text."""
    block = STORY_BY_N.get(current_n) or STORY_BY_N[1]
    lower = (text or "").lower()
    for d in block["decisions"]:
        target = d.get("goto")
        if not target or target == current_n:
            continue
        words = [w for w in re.findall(r"[a-zA-ZñÑ]{4,}", d["when"].lower())
                 if w not in _STOP]
        if any(w in lower for w in words):
            return target
    return None


def block_objective(n):
    b = STORY_BY_N.get(n) or STORY_BY_N[1]
    return b["objective"]

'''


def _blocks_json():
    """Read the Convai blocks straight from the TypeScript source of truth."""
    src = STORY_TS.read_text(encoding="utf-8")
    m = re.search(r"export const STORY_BLOCKS[^=]*=\s*(\[.*?\n\]);", src, re.S)
    if not m:
        raise SystemExit(f"STORY_BLOCKS not found in {STORY_TS}")
    js = re.sub(r"(\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:", r'\1"\2":', m.group(1))
    blocks = json.loads(js)
    if len(blocks) != 15:
        raise SystemExit(f"expected 15 story blocks, found {len(blocks)}")
    return json.dumps(blocks, ensure_ascii=False, indent=1)


BLOCKS_JSON = _blocks_json()


def patch_source(src: str) -> str:
    if "STORY_BLOCKS" in src:
        return src

    # 1. Insert the story-block code right after the persona prompt.
    anchor = "\n\ndef llm_reply("
    if anchor not in src:
        raise SystemExit("anchor 'def llm_reply(' not found")
    story_code = STORY_CODE.replace("__BLOCKS__", BLOCKS_JSON)
    src = src.replace(anchor, story_code + "\ndef llm_reply(", 1)

    # 2. Teach llm_reply to honour the active story block.
    src = src.replace(
        "def llm_reply(user_text, context, max_tokens=300, temperature=0.6):\n"
        '    system = SALES_AGENT_SYSTEM + "\\n\\nDATOS NG TINDAHAN:\\n" + context',
        "def llm_reply(user_text, context, max_tokens=300, temperature=0.6, story_n=1):\n"
        "    # The active Convai block's objective is the instruction Convai itself\n"
        "    # would send, so INDAY stays in character per scene.\n"
        '    system = (SALES_AGENT_SYSTEM\n'
        '              + f"\\n\\nSTORY BLOCK {story_n}: {block_objective(story_n)}"\n'
        '              + "\\n\\nDATOS NG TINDAHAN:\\n" + context)',
        1,
    )

    # 3. Accept the block from the client, the same way the React app sends it.
    src = src.replace(
        "class ChatReq(BaseModel):\n"
        "    messages: List[Dict[str, Any]]\n"
        "    max_tokens: Optional[int] = 300\n"
        "    temperature: Optional[float] = 0.6",
        "class ChatReq(BaseModel):\n"
        "    messages: List[Dict[str, Any]]\n"
        "    max_tokens: Optional[int] = 300\n"
        "    temperature: Optional[float] = 0.6\n"
        "    story_block: Optional[int] = None",
        1,
    )

    # 4. Thread the block through the reply pipeline.
    src = src.replace(
        "def buyer_reply(text, max_tokens=300, temperature=0.6):",
        "def buyer_reply(text, max_tokens=300, temperature=0.6, story_n=1):",
        1,
    )
    src = src.replace(
        "answer = llm_reply(text, buyer_context(), max_tokens, temperature)",
        "answer = llm_reply(text, buyer_context(), max_tokens, temperature, story_n)",
        1,
    )

    # 5. Report the block in the response and expose the graph.
    src = src.replace(
        'def _resp(text):\n'
        '    return {\n'
        '        "object": "chat.completion",\n'
        '        "model": MODEL_NAME,\n',
        'def _resp(text, story_n=1):\n'
        '    return {\n'
        '        "object": "chat.completion",\n'
        '        "model": MODEL_NAME,\n'
        '        "story_block": story_n,\n',
        1,
    )
    src = src.replace(
        '    return {"ok": True, "model": MODEL_NAME, "agent": AGENT_NAME}',
        '    return {\n'
        '        "ok": True,\n'
        '        "model": MODEL_NAME,\n'
        '        "agent": AGENT_NAME,\n'
        '        "convai_character": CONVAI_CHARACTER_ID,\n'
        '        "story_blocks": len(STORY_BLOCKS),\n'
        '    }\n'
        '\n'
        '\n'
        '@app.get("/story")\n'
        'def story():\n'
        '    return {"blocks": STORY_BLOCKS, "convai_character": CONVAI_CHARACTER_ID}',
        1,
    )
    # 6. Pass the block from the request into the reply and echo it back.
    src = src.replace(
        "    with STATE_LOCK:\n"
        "        if is_seller(x_seller_token):\n"
        "            text = seller_reply(last_user)\n"
        "        else:\n"
        "            text = buyer_reply(last_user, req.max_tokens or 300, req.temperature or 0.6)\n"
        "    return _resp(text)",
        "    story_n = req.story_block or 1\n"
        "    if story_n not in STORY_BY_N:\n"
        "        story_n = 1\n"
        "\n"
        "    with STATE_LOCK:\n"
        "        if is_seller(x_seller_token):\n"
        "            text = seller_reply(last_user)\n"
        "        else:\n"
        "            text = buyer_reply(\n"
        "                last_user, req.max_tokens or 300, req.temperature or 0.6, story_n\n"
        "            )\n"
        "    return _resp(text, story_n)",
        1,
    )
    # 7. Stop the model from looping. INDAY's answers are spoken aloud, so a
    # runaway paragraph is worse than a short one.
    src = src.replace(
        "        max_tokens=max_tokens,\n"
        "        temperature=temperature,\n"
        "        top_p=0.9,\n"
        "    )",
        "        max_tokens=min(max_tokens, 160),\n"
        "        temperature=temperature,\n"
        "        top_p=0.9,\n"
        "        repeat_penalty=1.18,\n"
        "        frequency_penalty=0.35,\n"
        "        presence_penalty=0.2,\n"
        "        stop=[\"<|im_end|>\", \"</s>\", \"\\n\\nBoss,\"],\n"
        "    )",
        1,
    )

    # 8. Collapse any leftover repetition so speech never loops.
    src = src.replace(
        "    return out[\"choices\"][0][\"message\"][\"content\"].strip()",
        "    return _dedupe(out[\"choices\"][0][\"message\"][\"content\"].strip())",
        1,
    )

    src = src.replace(
        "def llm_reply(",
        "def _dedupe(text, max_repeats=1):\n"
        "    \"\"\"Drop sentences the model emitted more than once.\"\"\"\n"
        "    parts = re.split(r\"(?<=[.!?])\\s+\", text)\n"
        "    seen, out = {}, []\n"
        "    for p in parts:\n"
        "        key = p.strip().lower()\n"
        "        if not key:\n"
        "            continue\n"
        "        seen[key] = seen.get(key, 0) + 1\n"
        "        if seen[key] <= max_repeats:\n"
        "            out.append(p.strip())\n"
        "    return \" \".join(out)\n"
        "\n"
        "\n"
        "def llm_reply(",
        1,
    )
    # 9. Never speak a sentence cut in half: trim to the last complete sentence.
    src = src.replace(
        "def _dedupe(text, max_repeats=1):",
        "def _tidy(text, max_chars=320):\n"
        "    \"\"\"Keep at most two full sentences, so speech never stops mid-word.\"\"\"\n"
        "    text = re.sub(r\"\\s+\", \" \", text).strip()\n"
        "    parts = re.split(r\"(?<=[.!?])\\s+\", text)\n"
        "    out = \"\"\n"
        "    for p in parts:\n"
        "        if out and len(out) + len(p) + 1 > max_chars:\n"
        "            break\n"
        "        out = (out + \" \" + p).strip()\n"
        "    if out and not out.endswith((\".\", \"!\", \"?\")):\n"
        "        out = out.rsplit(\" \", 1)[0].rstrip(\",;:\") + \".\"\n"
        "    return out or text\n"
        "\n"
        "\n"
        "def _dedupe(text, max_repeats=1):",
        1,
    )
    src = src.replace(
        'return _dedupe(out["choices"][0]["message"]["content"].strip())',
        'return _tidy(_dedupe(out["choices"][0]["message"]["content"].strip()))',
        1,
    )
    # 10. Ground the numbers sentence by sentence. Dropping the whole reply made
    # INDAY answer a plain greeting with a canned disclaimer; trimming only the
    # sentences that invent figures keeps her voice and still blocks fake prices.
    src = src.replace(
        "    answer = llm_reply(text, buyer_context(), max_tokens, temperature, story_n)\n"
        '    if not check_guardrails(answer)["ok"] or not numbers_grounded(answer):\n'
        '        return "Titingnan ko po muna, boss, para sigurado. Ang seller ang may final approval."\n'
        "    return answer",
        "    answer = llm_reply(text, buyer_context(), max_tokens, temperature, story_n)\n"
        '    if not check_guardrails(answer)["ok"]:\n'
        '        return "Titingnan ko po muna, boss, para sigurado. Ang seller ang may final approval."\n'
        "    return _ground_numbers(answer)",
        1,
    )

    src = src.replace(
        "def numbers_grounded(answer):\n"
        "    return all_numbers(answer) <= all_numbers(buyer_context())",
        "def numbers_grounded(answer):\n"
        "    return all_numbers(answer) <= all_numbers(buyer_context())\n"
        "\n"
        "\n"
        "def _ground_numbers(answer):\n"
        '    """Drop only the sentences that quote a figure the store data cannot back."""\n'
        "    allowed = all_numbers(buyer_context())\n"
        "    kept = []\n"
        "    for sentence in re.split(r\"(?<=[.!?])\\s+\", answer):\n"
        "        if not sentence.strip():\n"
        "            continue\n"
        "        if all_numbers(sentence) <= allowed:\n"
        "            kept.append(sentence.strip())\n"
        "    if not kept:\n"
        '        return "Titingnan ko po muna, boss, para sigurado. Ang seller ang may final approval."\n'
        '    return " ".join(kept)',
        1,
    )
    return src


def main():
    nb = json.loads(NB.read_text(encoding="utf-8"))
    cell = nb["cells"][3]
    src = "".join(cell["source"])
    new = patch_source(src)
    cell["source"] = new.splitlines(keepends=True)
    NB.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
    print("patched cell 3:", len(src), "->", len(new), "chars")


if __name__ == "__main__":
    main()
