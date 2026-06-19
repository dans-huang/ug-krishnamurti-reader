#!/usr/bin/env python3
"""
Merge all i18n/out/*.json translation files into data.zh.js (window.UG_ZH).
Reports coverage and lists any chunks/keys still missing.

Run: python3 i18n/assemble.py
"""
import json, os, glob, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHUNK_DIR = os.path.join(HERE, "chunks")
OUT_DIR = os.path.join(HERE, "out")

def all_keys():
    keys = set()
    for fn in glob.glob(os.path.join(CHUNK_DIR, "*.json")):
        d = json.load(open(fn, encoding="utf-8"))
        for u in d["units"]:
            keys.add(u["k"])
    return keys

def load_existing():
    """Seed from any prior data.zh.js so incremental runs preserve past work."""
    p = os.path.join(ROOT, "data.zh.js")
    if not os.path.exists(p):
        return {}
    raw = open(p, encoding="utf-8").read().strip()
    raw = re.sub(r"^window\.UG_ZH\s*=\s*", "", raw)
    raw = re.sub(r";\s*$", "", raw)
    try:
        return json.loads(raw)
    except Exception:
        return {}


def main():
    merged = load_existing()
    for fn in sorted(glob.glob(os.path.join(OUT_DIR, "*.json"))):
        try:
            d = json.load(open(fn, encoding="utf-8"))
        except Exception as e:
            print("!! bad json:", os.path.basename(fn), e); continue
        if isinstance(d, dict):
            for k, v in d.items():
                if isinstance(v, str) and v.strip():
                    merged[k] = v

    total = all_keys()
    missing = total - set(merged.keys())

    with open(os.path.join(ROOT, "data.zh.js"), "w", encoding="utf-8") as f:
        f.write("window.UG_ZH = " + json.dumps(merged, ensure_ascii=False) + ";\n")

    # which chunk ids still incomplete
    incomplete = []
    for fn in sorted(glob.glob(os.path.join(CHUNK_DIR, "*.json"))):
        d = json.load(open(fn, encoding="utf-8"))
        ks = [u["k"] for u in d["units"]]
        done = sum(1 for k in ks if k in merged)
        if done < len(ks):
            incomplete.append((d["id"], done, len(ks)))

    print("translated keys: {:,} / {:,}  ({:.1f}%)".format(
        len(merged), len(total), 100.0 * len(merged) / max(1, len(total))))
    print("missing keys   :", len(missing))
    if incomplete:
        print("incomplete chunks:", ", ".join(
            "%s(%d/%d)" % (cid, d, t) for cid, d, t in incomplete))
    else:
        print("ALL CHUNKS COMPLETE ✓")

if __name__ == "__main__":
    main()
