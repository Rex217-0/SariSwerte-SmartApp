#!/usr/bin/env python3
"""Create the SariSwerte database and its five collections in Appwrite.

Run once, with an API key that has databases + collections + documents scope:

    export APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
    export APPWRITE_PROJECT_ID=...
    export APPWRITE_API_KEY=...
    python3 scripts/setup-appwrite.py

Idempotent: existing collections are left alone. The API key is read from the
environment only and is never written to disk or printed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ENDPOINT = os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1").rstrip("/")
PROJECT = os.environ.get("APPWRITE_PROJECT_ID", "")
KEY = os.environ.get("APPWRITE_API_KEY", "")
DB = os.environ.get("APPWRITE_DB", "sariswerte")

# Appwrite attribute types: string, integer, float, boolean, datetime
SCHEMA = {
    "vendors": [
        ("name", "string", 128, True),
        ("storeName", "string", 128, True),
        ("phone", "string", 32, False),
        ("address", "string", 256, False),
        ("createdAt", "datetime", None, False),
    ],
    "sales": [
        ("vendorId", "string", 64, True),
        ("item", "string", 128, True),
        ("qty", "integer", None, True),
        ("unitPrice", "float", None, True),
        ("total", "float", None, True),
        ("paidWith", "string", 16, True),
        ("soldAt", "datetime", None, True),
    ],
    "inventory": [
        ("vendorId", "string", 64, True),
        ("item", "string", 128, True),
        ("qty", "integer", None, True),
        ("unitCost", "float", None, True),
        ("unitPrice", "float", None, True),
        ("reorderAt", "integer", None, True),
    ],
    "utang": [
        ("vendorId", "string", 64, True),
        ("customer", "string", 128, True),
        ("amount", "float", None, True),
        ("note", "string", 256, False),
        ("settled", "boolean", None, True),
        ("openedAt", "datetime", None, True),
    ],
    "feedback": [
        ("vendorId", "string", 64, True),
        ("customer", "string", 128, True),
        ("rating", "integer", None, True),
        ("message", "string", 1024, True),
        ("createdAt", "datetime", None, True),
    ],
}


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    url = f"{ENDPOINT}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-Appwrite-Project", PROJECT)
    req.add_header("X-Appwrite-Key", KEY)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {"message": e.read().decode()[:200]}
    except urllib.error.URLError as e:
        return 0, {"message": str(e)}


def main() -> int:
    missing = [n for n, v in (("APPWRITE_PROJECT_ID", PROJECT), ("APPWRITE_API_KEY", KEY)) if not v]
    if missing:
        print(f"Missing: {', '.join(missing)}", file=sys.stderr)
        return 2

    status, _ = call("POST", "/databases", {"databaseId": DB, "name": "SariSwerte"})
    print(f"database {DB}: {status}{' (exists)' if status == 409 else ''}")

    for name, attrs in SCHEMA.items():
        status, _ = call(
            "POST",
            f"/databases/{DB}/collections",
            {"collectionId": name, "name": name.title(), "permissions": ['read("any")', 'create("any")']},
        )
        print(f"  collection {name}: {status}{' (exists)' if status == 409 else ''}")
        for attr, kind, size, required in attrs:
            body: dict = {"key": attr, "type": kind, "required": required}
            if kind == "string":
                body["size"] = size or 128
            status, payload = call("POST", f"/databases/{DB}/collections/{name}/attributes/{kind}", body)
            if status not in (200, 201, 202, 409):
                print(f"    attribute {attr}: {status} {payload.get('message', '')[:80]}")

    print("\nDone. Put these in .env:")
    print(f"  VITE_APPWRITE_ENDPOINT={ENDPOINT}")
    print(f"  VITE_APPWRITE_PROJECT_ID={PROJECT}")
    print(f"  VITE_APPWRITE_DB={DB}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
