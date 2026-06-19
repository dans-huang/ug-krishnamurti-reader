#!/usr/bin/env python3
"""
Parse the U.G. Krishnamurti OCR'd .txt books into clean structured data
for the reader web app. Emits data.js -> window.UG_LIBRARY.

Run:  python3 build.py
"""
import json
import re
import os
import sys

SRC = os.path.expanduser("~/Downloads/ug-krishnamurti-books")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")

WORDS_PER_MIN = 220          # reading-speed estimate
MIN_SEGMENT_WORDS = 30       # drop TOC-fragment "chapters"

# ----------------------------------------------------------------------------
# Per-book configuration. content_start = line index (1-based) below which any
# header match is ignored (skips duplicated table-of-contents headers).
# ----------------------------------------------------------------------------
BOOKS = [
    {
        "id": "mystique",
        "num": 1,
        "file": "01-The-Mystique-of-Enlightenment.txt",
        "title": "The Mystique of Enlightenment",
        "subtitle": "The unrational ideas of a man called U.G.",
        "year": 1982,
        "source": "India & Switzerland, 1973–1976 conversations",
        "header_re": r"^Part (One|Two|Three|Four)\b",
        "content_start": 100,
        "title_mode": "part_paren",
        "front_title": "About This Book",
    },
    {
        "id": "myth",
        "num": 2,
        "file": "02-Mind-is-a-Myth.txt",
        "title": "Mind Is a Myth",
        "subtitle": "Disquieting conversations with the man called U.G.",
        "year": 1988,
        "source": "Edited by Terry Newland",
        "header_re": r"^CHAPTER \d+\s*:\s*.+",
        "content_start": 100,
        "title_mode": "inline_colon",
        "front_title": "Introduction — A Note at the Beginning",
    },
    {
        "id": "courage",
        "num": 5,
        "file": "03-The-Courage-to-Stand-Alone.txt",
        "title": "The Courage to Stand Alone",
        "subtitle": "Conversations with U.G. Krishnamurti",
        "year": 1997,
        "source": "Edited by Ellen Chrystal",
        "header_re": r"^(Part\s+I|PART\s+2|PART\s+3)\b",
        "content_start": 200,
        "title_mode": "next_line",
        "front_title": "Introduction",
    },
    {
        "id": "thought",
        "num": 3,
        "file": "04-Thought-is-Your-Enemy.txt",
        "title": "Thought Is Your Enemy",
        "subtitle": "Spontaneous talks and dialogues",
        "year": 1991,
        "source": "Goa & Bangalore conversations",
        "header_re": r"^CHAPTER \d+\s*$",
        "content_start": 100,
        "title_mode": "next_line",
        "front_title": "Foreword",
    },
    {
        "id": "natural",
        "num": 6,
        "file": "05-The-Natural-State.txt",
        "title": "The Natural State",
        "subtitle": "In the words of U.G. Krishnamurti",
        "year": 2005,
        "source": "Compiled by Peter Maverick",
        "header_re": r"^\d{4}[-—]",
        "content_start": 100,
        "title_mode": "header_self",
        "front_title": "Introduction",
    },
    {
        "id": "noway",
        "num": 4,
        "file": "06-No-Way-Out.txt",
        "title": "No Way Out",
        "subtitle": "Further dialogues with U.G. Krishnamurti",
        "year": 1991,
        "source": "Edited by J.S.R.L. Narayana Moorty",
        "content_start": 100,   # skip the table-of-contents region
        # OCR headings vary (mostly ALL-CAPS, ch.4 is Title Case), so anchor on
        # exact lines (matched normalised) with hand-clean titles.
        "manual_chapters": [
            ("INTRODUCTION", "", "Introduction"),
            ("THE UNRATIONAL PHILOSOPHY OF U.G.KRISHNAMURTI", "Chapter 1", "The Unrational Philosophy of U.G."),
            ("NOTHING TO BE TRANSFORMED", "Chapter 2", "Nothing to Be Transformed"),
            ("WHAT IS THE MEANING OF LIFE?", "Chapter 3", "What Is the Meaning of Life?"),
            ("You Invent Your Reality", "Chapter 4", "You Invent Your Reality"),
            ("RELIGIOUS THINKING IS RESPONSIBLE FOR MAN'S TRAGEDY", "Chapter 5", "Religious Thinking Is Responsible for Man's Tragedy"),
            ("SEEKING STRENGTHENS SEPARATION", "Chapter 6", "Seeking Strengthens Separation"),
            ("WHAT KIND OF A HUMAN BEING DO YOU WANT?", "Chapter 7", "What Kind of a Human Being Do You Want?"),
            ("THE BUILD-UP OF SEX AND LOVE", "Chapter 8", "The Build-Up of Sex and Love"),
            ("LEAVE THE BODY ALONE?", "Chapter 9", "Leave the Body Alone"),
            ("IT'S TERROR, NOT LOVE, THAT KEEPS US TOGETHER", "Chapter 10", "It's Terror, Not Love, That Keeps Us Together"),
            ("U.G. - IS HE FOR REAL?", "Chapter 11", "U.G. — Is He for Real?"),
        ],
    },
]

SPEAKER_RE = re.compile(
    r"^(Q|Question|Questioner|U\.?G\.?|UG|Interlocutor|Visitor|Interviewer)\s*[:.]",
    re.IGNORECASE,
)

NOISE_PARA_RE = re.compile(r"^(U\.?\s*G\.?|[ivxlc]+|\d{1,4}|[*#=\-—\.]+)$", re.IGNORECASE)


def clean_line(s: str) -> str:
    s = s.replace("\x0c", "")          # form feed
    s = s.replace("\t", " ")
    s = re.sub(r"[  ]{2,}", " ", s)  # collapse OCR double-spaces
    return s.strip()


def normalize_text(s: str) -> str:
    # em-dash normalisation for the double-hyphen OCR convention
    s = re.sub(r"\s--\s", " — ", s)
    s = re.sub(r"--", "—", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def lines_to_paragraphs(lines):
    """Join OCR-wrapped lines into paragraphs (blank line = break). Force a
    new paragraph when a line opens with a speaker label."""
    paras, cur = [], []

    def flush():
        if cur:
            paras.append(" ".join(cur).strip())
            cur.clear()

    for raw in lines:
        ln = clean_line(raw)
        if not ln:
            flush()
            continue
        if SPEAKER_RE.match(ln):
            flush()
        # de-hyphenate across previous wrapped line
        if cur and cur[-1].endswith("-") and re.search(r"[A-Za-z]-$", cur[-1]):
            cur[-1] = cur[-1][:-1] + ln
        else:
            cur.append(ln)
    flush()
    return paras


def build_blocks(paras):
    """Turn paragraphs into render blocks, tagging dialogue speakers."""
    blocks = []
    for p in paras:
        p = normalize_text(p)
        if not p:
            continue
        if NOISE_PARA_RE.match(p.replace(" ", "")):
            continue
        if len(p) < 2:
            continue
        m = SPEAKER_RE.match(p)
        if m:
            label = m.group(0).rstrip(":. ")
            up = label.upper().replace(" ", "").replace(".", "")
            if up in ("UG",):
                speaker = "ug"
            elif up.startswith("Q") or "QUESTION" in up or up in ("VISITOR", "INTERLOCUTOR", "INTERVIEWER"):
                speaker = "q"
            else:
                speaker = "q"
            text = p[m.end():].strip()
            blocks.append({"type": "speech", "speaker": speaker,
                           "label": label, "text": text})
        else:
            blocks.append({"type": "p", "text": p})
    return blocks


def word_count_blocks(blocks):
    n = 0
    for b in blocks:
        n += len(b["text"].split())
    return n


def title_case(s):
    small = {"a", "an", "the", "and", "but", "or", "nor", "to", "of",
             "in", "on", "at", "as", "by"}
    words = s.split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if 0 < i < len(words) - 1 and lw in small:
            out.append(lw)
        else:
            out.append(w[:1].upper() + w[1:].lower() if w.isupper() else w)
    return " ".join(out)


def extract_title(cfg, header_text, body_lines):
    """Return (eyebrow, title, subtitle, remaining_body_lines)."""
    mode = cfg["title_mode"]
    eyebrow, title, subtitle = "", header_text.strip(), ""
    body = list(body_lines)

    if mode == "inline_colon":
        m = re.match(r"^(CHAPTER \d+)\s*:\s*(.+)$", header_text.strip(), re.IGNORECASE)
        if m:
            eyebrow = title_case(m.group(1))
            title = title_case(m.group(2))
    elif mode == "header_self":
        eyebrow = "Conversations"
        title = header_text.strip()
    elif mode == "part_paren":
        eyebrow = header_text.strip()  # "Part One"
        title = header_text.strip()
        # scan the first few lines for a real heading and a parenthetical
        seen = 0
        for i, raw in enumerate(body[:10]):
            ln = clean_line(raw)
            if not ln:
                continue
            if NOISE_PARA_RE.match(ln.replace(" ", "")):
                body[i] = ""
                continue
            if ln.startswith("(") and len(ln) > 6:
                subtitle = ln.strip("()").strip()
                body[i] = ""
                continue
            # a short, non-sentence line = the part's own heading
            if not subtitle and title == eyebrow and len(ln) <= 70 \
                    and not re.search(r"[.;,:]\s*$", ln) and ln[0:1].isupper():
                title = title_case(ln) if ln.isupper() else ln
                body[i] = ""
            seen += 1
            if seen >= 3:
                break
    elif mode == "next_line":
        m = re.match(r"^(Part|PART|CHAPTER)\s+([IVXLC0-9]+)", header_text.strip())
        if m:
            kind = m.group(1).capitalize()
            num = m.group(2)
            roman = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
                     "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10"}
            num = roman.get(num.upper(), num)
            eyebrow = f"{kind} {num}"
        # first short, heading-like line becomes the title
        for i, raw in enumerate(body):
            ln = clean_line(raw)
            if not ln:
                continue
            if NOISE_PARA_RE.match(ln.replace(" ", "")):
                body[i] = ""  # consume noise line
                continue
            if len(ln) <= 70 and not re.search(r"[.;,:]\s*$", ln) and ln[0:1].isupper():
                title = title_case(ln) if ln.isupper() else ln
                body[i] = ""  # remove from body
            break

    # tidy OCR spacing around punctuation
    title = re.sub(r"\s+([,.;:!?])", r"\1", title).strip()
    subtitle = re.sub(r"\s+([,.;:!?])", r"\1", subtitle).strip()
    return eyebrow, title, subtitle, body


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", clean_line(s).lower())


def split_manual(cfg, lines):
    """Split using an explicit ordered list of (match_line, eyebrow, title)."""
    cstart = cfg.get("content_start", 0)
    specs = cfg["manual_chapters"]
    found = []
    for match, eyebrow, title in specs:
        target = _norm(match)
        idx = None
        for i, raw in enumerate(lines):
            if (i + 1) >= cstart and _norm(raw) == target:
                idx = i
                break
        if idx is None:
            print("   !! heading not found:", match)
            continue
        found.append((idx, eyebrow, title))
    found.sort(key=lambda x: x[0])

    chapters = []
    for j, (start, eyebrow, title) in enumerate(found):
        end = found[j + 1][0] if j + 1 < len(found) else len(lines)
        body_lines = lines[start + 1:end]
        blocks = build_blocks(lines_to_paragraphs(body_lines))
        if word_count_blocks(blocks) < MIN_SEGMENT_WORDS:
            continue
        chapters.append(make_chapter(eyebrow, title, "", blocks))
    return chapters


def split_chapters(cfg, lines):
    if cfg.get("manual_chapters"):
        return split_manual(cfg, lines)
    header_re = re.compile(cfg["header_re"])
    cstart = cfg.get("content_start", 0)

    # find accepted header line indices
    idxs = []
    for i, raw in enumerate(lines):
        if (i + 1) >= cstart and header_re.match(clean_line(raw)):
            idxs.append(i)

    chapters = []

    # front matter
    front_end = idxs[0] if idxs else len(lines)
    front_lines = lines[:front_end]
    front_blocks = build_blocks(lines_to_paragraphs(front_lines))
    # trim leading duplicate cover lines: drop blocks until first real sentence
    front_blocks = trim_front(front_blocks, cfg)
    if word_count_blocks(front_blocks) >= 25:
        chapters.append(make_chapter("", cfg["front_title"], "", front_blocks))

    for j, start in enumerate(idxs):
        end = idxs[j + 1] if j + 1 < len(idxs) else len(lines)
        header_text = clean_line(lines[start])
        body_lines = lines[start + 1:end]
        eyebrow, title, subtitle, body_lines = extract_title(cfg, header_text, body_lines)
        blocks = build_blocks(lines_to_paragraphs(body_lines))
        if word_count_blocks(blocks) < MIN_SEGMENT_WORDS:
            continue
        chapters.append(make_chapter(eyebrow, title, subtitle, blocks))

    return chapters


def trim_front(blocks, cfg):
    """Remove repeated cover/title noise at the very top of front matter."""
    title_words = set(re.findall(r"[a-z]+", cfg["title"].lower()))
    out = []
    started = False
    for b in blocks:
        t = b["text"]
        if not started:
            # skip short echoey lines that just repeat the title/author
            words = re.findall(r"[a-z]+", t.lower())
            if len(t) < 60 and (set(words) <= title_words or len(words) <= 4):
                continue
            started = True
        out.append(b)
    return out or blocks


def collapse_poems(blocks):
    """OCR sometimes breaks poems into one-word-per-line, which become a long
    run of tiny paragraphs. Merge any run of >=5 consecutive ultra-short
    (<=2-word) prose paragraphs back into a single block."""
    out = []
    i = 0
    n = len(blocks)
    while i < n:
        b = blocks[i]
        if b["type"] == "p" and len(b["text"].split()) <= 2:
            j = i
            run = []
            while j < n and blocks[j]["type"] == "p" and len(blocks[j]["text"].split()) <= 2:
                run.append(blocks[j]["text"])
                j += 1
            if len(run) >= 5:
                out.append({"type": "p", "text": " ".join(run)})
                i = j
                continue
        out.append(b)
        i += 1
    return out


def make_chapter(eyebrow, title, subtitle, blocks):
    blocks = collapse_poems(blocks)
    wc = word_count_blocks(blocks)
    return {
        "eyebrow": eyebrow,
        "title": title,
        "subtitle": subtitle,
        "blocks": blocks,
        "words": wc,
        "minutes": max(1, round(wc / WORDS_PER_MIN)),
    }


# ---------------------------------------------------------------------------
# YouTube supplemental transcripts
# ---------------------------------------------------------------------------
def parse_recording(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    parts = re.split(r"^=+\s*$", raw, flags=re.MULTILINE)
    header = parts[0]
    body = parts[1] if len(parts) > 1 else raw
    meta = {}
    for line in header.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip().lower()] = v.strip()
    title = header.splitlines()[0].strip() if header.strip() else os.path.basename(path)
    title = title.strip().strip('"')

    paras = [normalize_text(p) for p in re.split(r"\n\s*\n", body) if p.strip()]
    blocks = []
    for p in paras:
        m = re.match(r"^[—-]\s*(.+)", p)  # interviewer prompt lines
        if m:
            blocks.append({"type": "speech", "speaker": "q", "label": "Q",
                           "text": m.group(1).strip()})
        else:
            blocks.append({"type": "p", "text": p})
    wc = word_count_blocks(blocks)
    return {
        "title": title,
        "subtitle": next((header.splitlines()[i].strip()
                          for i in range(1, min(3, len(header.splitlines())))), ""),
        "url": meta.get("url", ""),
        "blocks": blocks,
        "words": wc,
        "minutes": max(1, round(wc / WORDS_PER_MIN)),
    }


def main():
    library = {"books": [], "recordings": []}

    # emit books in chronological order (by `num`)
    for cfg in sorted(BOOKS, key=lambda c: c["num"]):
        path = os.path.join(SRC, cfg["file"])
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        chapters = split_chapters(cfg, lines)
        total_words = sum(c["words"] for c in chapters)
        library["books"].append({
            "id": cfg["id"],
            "num": cfg["num"],
            "title": cfg["title"],
            "subtitle": cfg["subtitle"],
            "year": cfg["year"],
            "source": cfg["source"],
            "chapters": chapters,
            "words": total_words,
            "minutes": max(1, round(total_words / WORDS_PER_MIN)),
        })
        print(f"[{cfg['num']}] {cfg['title']}: {len(chapters)} chapters, "
              f"{total_words:,} words")
        for c in chapters:
            print(f"      - {c['eyebrow'] or '·':<12} {c['title'][:52]:<52} "
                  f"{c['words']:>6} w")

    rec_dir = os.path.join(SRC, "supplemental-youtube")
    if os.path.isdir(rec_dir):
        for fn in sorted(os.listdir(rec_dir)):
            if fn.endswith(".txt"):
                rec = parse_recording(os.path.join(rec_dir, fn))
                library["recordings"].append(rec)
                print(f"[rec] {rec['title'][:60]}: {rec['words']:,} words")

    data = "window.UG_LIBRARY = " + json.dumps(library, ensure_ascii=False) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(data)
    size = os.path.getsize(OUT)
    print(f"\nWrote {OUT} ({size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
