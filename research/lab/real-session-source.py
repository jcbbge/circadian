#!/usr/bin/env python3
"""Prepare private, whole-turn conversation prefixes; never call inference.

Usage: python3 real-session-source.py SELECTION_JSON PRIVATE_OUTPUT_JSON
The selection supplies native paths, a local tokenizer.json, and token_cap.
Native transcripts remain authoritative; output is a bounded research input.
"""

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re

from tokenizers import Tokenizer


MAX_TOKENS = 18_000
REDACTIONS = {
    "pem_private_key": re.compile(
        r"-----BEGIN (?P<label>(?:[A-Z0-9]+ )?PRIVATE KEY)-----"
        r"[\s\S]*?-----END (?P=label)-----"
    ),
    **{
        prefix: re.compile(r"(?<![A-Za-z0-9_])" + re.escape(prefix) + r"[A-Za-z0-9_-]{8,}")
        for prefix in ("apikey_", "sk-", "pplx-", "ghp_", "github_pat_")
    },
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def parse_rows(raw):
    """Strict JSONL parsing: a terminal newline is allowed, blank rows are not."""
    lines = raw.decode("utf-8").split("\n")
    if lines[-1] == "":
        lines.pop()
    rows = []
    for line, value in enumerate(lines, 1):
        try:
            row = json.loads(value)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid JSON at source line {line}") from None
        if not isinstance(row, dict) or not all(
            isinstance(row.get(key), str) and row[key] for key in ("type", "id")
        ):
            raise ValueError(f"Invalid record at source line {line}")
        parent = row.get("parentId")
        if parent is not None and (not isinstance(parent, str) or not parent):
            raise ValueError(f"Invalid parent at source line {line}")
        if row["type"] == "message":
            message = row.get("message")
            if not isinstance(message, dict) or not isinstance(message.get("role"), str):
                raise ValueError(f"Invalid message at source line {line}")
            if message["role"] in ("user", "assistant"):
                content = message.get("content")
                if isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict) or not isinstance(block.get("type"), str):
                            raise ValueError(f"Invalid content block at source line {line}")
                        if block["type"] == "text" and not isinstance(block.get("text"), str):
                            raise ValueError(f"Invalid text block at source line {line}")
                elif not isinstance(content, str):
                    raise ValueError(f"Invalid dialogue content at source line {line}")
        rows.append((line, row))
    if not rows:
        raise ValueError("Empty native source")
    return rows


def latest_chain(rows):
    """Validate every parent graph, then retain only the last record's ancestry."""
    by_id = {}
    for line, row in rows:
        if row["id"] in by_id:
            raise ValueError(f"Duplicate record ID at source line {line}")
        by_id[row["id"]] = (line, row)
    for line, row in rows:
        if row.get("parentId") is not None and row["parentId"] not in by_id:
            raise ValueError(f"Missing parent at source line {line}")
    checked = set()
    for _, row in rows:
        current, visiting = row["id"], set()
        while current is not None and current not in checked:
            if current in visiting:
                raise ValueError("Cycle in native parent graph")
            visiting.add(current)
            current = by_id[current][1].get("parentId")
        checked.update(visiting)
    chain, current = [], rows[-1][1]["id"]
    while current is not None:
        node = by_id[current]
        chain.append(node)
        current = node[1].get("parentId")
    chain.reverse()
    if any(a[0] >= b[0] for a, b in zip(chain, chain[1:])):
        raise ValueError("Selected ancestor chain is not chronological")
    return chain


def redact(text):
    counts = Counter()
    for name, pattern in REDACTIONS.items():
        text, count = pattern.subn("[REDACTED_CREDENTIAL]", text)
        counts[name] += count
    return text, counts


def dialogue(chain):
    turns, redactions, excluded = [], [], Counter()
    for line, row in chain:
        if row["type"] != "message":
            excluded["event:" + row["type"]] += 1
            continue
        if row["id"].startswith("context-"):
            excluded["context_bootstrap_message"] += 1
            continue
        message = row["message"]
        if message["role"] not in ("user", "assistant"):
            excluded["role:" + message["role"]] += 1
            continue
        content = message["content"]
        if isinstance(content, str):
            blocks = [content]
        else:
            blocks = [block["text"] for block in content if block["type"] == "text"]
            excluded.update("block:" + block["type"] for block in content if block["type"] != "text")
        if not blocks or not any(block != "" for block in blocks):
            excluded["message_without_visible_text"] += 1
            continue
        # Preserve each text block byte-for-byte except credential redaction.
        # Multiple visible blocks receive the documented presentation separator.
        text, counts = redact("\n\n".join(blocks))
        turns.append({"line": line, "role": message["role"], "text": text})
        redactions.append(counts)
    if not turns:
        raise ValueError("Selected chain has no eligible visible dialogue")
    return turns, redactions, excluded


def render(turns):
    return "\n\n".join(f"[line {turn['line']} | {turn['role']}]\n{turn['text']}" for turn in turns)


def token_count(tokenizer, text):
    return len(tokenizer.encode(text, add_special_tokens=False).ids)


def bounded_prefix(turns, tokenizer, cap):
    source, supplied = "", []
    for turn in turns:
        candidate = render(supplied + [turn])
        if token_count(tokenizer, candidate) > cap:
            break  # Never skip an oversized middle turn to include later material.
        supplied.append(turn)
        source = candidate
    if not supplied:
        raise ValueError("First eligible turn exceeds token cap")
    full = render(turns)
    assert supplied == turns[:len(supplied)] and full.startswith(source)
    assert source == render(supplied) and token_count(tokenizer, source) <= cap
    if len(supplied) < len(turns):
        assert token_count(tokenizer, render(turns[:len(supplied) + 1])) > cap
    return source, supplied, token_count(tokenizer, full)


def prepare(selection_path, output_path):
    output = Path(output_path)
    if output.exists():
        raise FileExistsError("Output already exists")
    selection_bytes = Path(selection_path).read_bytes()
    selection = json.loads(selection_bytes)
    cap = selection.get("token_cap", MAX_TOKENS)
    if type(cap) is not int or not 0 < cap <= MAX_TOKENS:
        raise ValueError("token_cap must be an integer between 1 and 18000")
    tokenizer_path = Path(selection["tokenizer"])
    tokenizer_bytes = tokenizer_path.read_bytes()
    tokenizer = Tokenizer.from_str(tokenizer_bytes.decode("utf-8"))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    sources, ids = [], set()
    for selected in selection["sessions"]:
        identifier = selected["id"]
        if not isinstance(identifier, str) or not identifier or identifier in ids:
            raise ValueError("Session IDs must be nonempty and unique")
        ids.add(identifier)
        raw = Path(selected["path"]).read_bytes()
        rows = parse_rows(raw)
        chain = latest_chain(rows)
        turns, redactions, excluded = dialogue(chain)
        source, supplied, full_tokens = bounded_prefix(turns, tokenizer, cap)
        references = [{"line": line, "id": row["id"]} for line, row in chain]
        full_redactions, prefix_redactions = Counter(), Counter()
        for i, counts in enumerate(redactions):
            full_redactions.update(counts)
            if i < len(supplied):
                prefix_redactions.update(counts)
        sources.append({
            "id": identifier, "source": source, "source_sha256": sha256(source.encode("utf-8")),
            "token_count": token_count(tokenizer, source), "full_token_count": full_tokens,
            "turns": supplied, "native_path": selected["path"], "native_sha256": sha256(raw),
            "chain": {
                "selection": "ancestry of last physical record, including parentless root",
                "leaf": references[-1], "root": references[0],
                "native_records": len(rows), "selected_records": len(chain),
                "off_chain_records": len(rows) - len(chain),
                "ordered_references_sha256": sha256(json.dumps(references, sort_keys=True).encode("utf-8")),
                "all_parent_graphs_validated": True,
            },
            "full_turn_count": len(turns), "supplied_turn_count": len(supplied),
            "full_role_counts": dict(Counter(t["role"] for t in turns)),
            "supplied_role_counts": dict(Counter(t["role"] for t in supplied)),
            "first_input_line": supplied[0]["line"], "line_cutoff": supplied[-1]["line"],
            "next_eligible_line": turns[len(supplied)]["line"] if len(supplied) < len(turns) else None,
            "prefix_only": len(supplied) < len(turns), "excluded": dict(excluded),
            "full_redaction_counts": dict(full_redactions), "supplied_redaction_counts": dict(prefix_redactions),
        })
    if not sources:
        raise ValueError("Selection contains no sources")
    result = {
        "schema": "circadian-real-session-source-v1", "sources": sources,
        "selection_sha256": sha256(selection_bytes), "token_cap": cap,
        "tokenizer": {"path": str(tokenizer_path), "sha256": sha256(tokenizer_bytes),
                      "add_special_tokens": False, "truncation": False, "padding": False},
        "presentation": {"turn_label": "[line {line} | {role}]\\n",
                         "turn_separator": "\n\n", "text_block_separator": "\n\n",
                         "context_id_rule": "exclude every message ID starting context-"},
        "scope": "Chronological whole-turn prefixes, not complete very long conversations. Token counts cover exact labeled source strings; downstream prompt framing is excluded.",
        "preparer_sha256": sha256(Path(__file__).read_bytes()),
    }
    encoded = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selection")
    parser.add_argument("output")
    args = parser.parse_args()
    prepared = prepare(args.selection, args.output)
    print(json.dumps({"sources": [
        {key: source[key] for key in ("id", "full_turn_count", "supplied_turn_count", "full_token_count", "token_count", "prefix_only")}
        for source in prepared["sources"]
    ]}))
