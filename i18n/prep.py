#!/usr/bin/env python3
"""
Split the English corpus (data.js) into translation chunk files.
Each chunk: i18n/chunks/NNN.json = {"id": "NNN", "units": [{"k": key, "t": english}, ...]}
Stable keys let us reassemble regardless of order or dropped items.

Run: python3 i18n/prep.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHUNK_DIR = os.path.join(HERE, "chunks")
TARGET_WORDS = 5500          # ~ per chunk; keeps subagent output reliable

def load_library():
    with open(os.path.join(ROOT, "data.js"), encoding="utf-8") as f:
        raw = f.read()
    raw = raw.strip()
    raw = re.sub(r"^window\.UG_LIBRARY\s*=\s*", "", raw)
    raw = re.sub(r";\s*$", "", raw)
    return json.loads(raw)


def load_done_keys():
    """Keys already translated in data.zh.js — skipped so re-runs are incremental."""
    p = os.path.join(ROOT, "data.zh.js")
    if not os.path.exists(p):
        return set()
    raw = open(p, encoding="utf-8").read().strip()
    raw = re.sub(r"^window\.UG_ZH\s*=\s*", "", raw)
    raw = re.sub(r";\s*$", "", raw)
    try:
        return set(json.loads(raw).keys())
    except Exception:
        return set()

def wc(s): return len(s.split())

def main():
    lib = load_library()
    units = []            # ordered list of (key, text)

    # headings: book + chapter titles/subtitles (kept together for context)
    for b in lib["books"]:
        units.append(("bt/" + b["id"], b["title"]))
        if b.get("subtitle"): units.append(("bs/" + b["id"], b["subtitle"]))
        for ci, c in enumerate(b["chapters"]):
            units.append(("ct/%s/%d" % (b["id"], ci), c["title"]))
            if c.get("subtitle"):
                units.append(("cs/%s/%d" % (b["id"], ci), c["subtitle"]))
    for i, r in enumerate(lib["recordings"]):
        units.append(("rt/%d" % i, r["title"]))
        if r.get("subtitle"): units.append(("rs/%d" % i, r["subtitle"]))

    done = load_done_keys()  # skip what's already translated (incremental)
    units = [(k, t) for k, t in units if k not in done]
    headings = list(units)   # first chunk(s): all headings

    # body blocks, grouped per chapter in reading order
    body = []   # list of ("seg-id", [(key,text), ...])
    for b in lib["books"]:
        for ci, c in enumerate(b["chapters"]):
            seg = []
            for bi, blk in enumerate(c["blocks"]):
                k = "b/%s/%d/%d" % (b["id"], ci, bi)
                if k not in done:
                    seg.append((k, blk["text"]))
            if seg:
                body.append(("%s/%d" % (b["id"], ci), seg))
    for i, r in enumerate(lib["recordings"]):
        seg = []
        for bi, blk in enumerate(r["blocks"]):
            k = "rb/%d/%d" % (i, bi)
            if k not in done:
                seg.append((k, blk["text"]))
        if seg:
            body.append(("rec/%d" % i, seg))

    # build chunks
    chunks = []

    # headings chunk(s)
    cur, cw = [], 0
    for k, t in headings:
        cur.append((k, t)); cw += wc(t)
        if cw >= TARGET_WORDS:
            chunks.append(cur); cur, cw = [], 0
    if cur: chunks.append(cur)

    # body: flatten all blocks in global reading order, pack to TARGET
    cur, cw = [], 0
    for seg_id, seg in body:
        for k, t in seg:
            cur.append((k, t)); cw += wc(t)
            if cw >= TARGET_WORDS:
                chunks.append(cur); cur, cw = [], 0
    if cur: chunks.append(cur)

    # clear stale chunk files
    for fn in os.listdir(CHUNK_DIR):
        if fn.endswith(".json"): os.remove(os.path.join(CHUNK_DIR, fn))

    total_units = 0; total_words = 0
    for idx, ch in enumerate(chunks):
        cid = "%03d" % idx
        payload = {"id": cid, "units": [{"k": k, "t": t} for k, t in ch]}
        with open(os.path.join(CHUNK_DIR, cid + ".json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        total_units += len(ch); total_words += sum(wc(t) for _, t in ch)

    print("chunks:", len(chunks))
    print("units :", total_units)
    print("words : {:,}".format(total_words))
    print("avg words/chunk:", total_words // max(1, len(chunks)))

if __name__ == "__main__":
    main()
