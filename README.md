# U.G. Krishnamurti — Reading Edition

A local, offline web app that turns the six public-domain U.G. Krishnamurti
books (plus two documentary transcripts) into a clean, Substack/Medium-style
reading experience.

## Run it

**Easiest (macOS):** double-click **`start.command`**. It starts a tiny local
server and opens the reader in your browser. Press `Ctrl-C` in the terminal
window to stop.

**From a terminal (any OS):**

```bash
cd ug-krishnamurti-reader
python3 -m http.server 8777
# then open http://localhost:8777/
```

(You can also just open `index.html` directly, but running the little server is
the most reliable way to get reading-position memory.)

## What's inside

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `styles.css` | All styling (three themes, typography, layout, CJK) |
| `app.js` | The reader: routing, contents, settings, progress, language modes |
| `data.js` | The parsed books (generated — do not edit by hand) |
| `data.zh.js` | Pre-translated Traditional Chinese (generated — do not edit by hand) |
| `build.py` | Parser that turns the raw `.txt` files into `data.js` |
| `i18n/` | Translation pipeline (chunk → translate → assemble) |

## Features

- **Library** — an editorial, numbered table of the six works + recordings.
- **Reader** — generous serif typography, drop caps, and a dedicated layout for
  the Q&A dialogue (questions vs. U.G.'s answers).
- **Three themes** — Paper, Sepia, and Ink (dark). Adjustable type size,
  reading face (serif/sans), and column width.
- **Built-in immersive translation (Traditional Chinese, zh-TW)** — every word
  of all six books is **pre-translated and baked in**, so
  switching language is instant with zero loading. Three modes in the settings
  panel:
  - **EN** — original English.
  - **雙語** — immersive bilingual: each English paragraph is followed by its
    Chinese translation (the classic side-by-side immersive-reading layout).
  - **中文** — full Traditional Chinese, set in Noto Serif TC.

  Titles, subtitles, chapter labels, the contents page, and dialogue all
  localize too. Your choice is remembered.
- **Reading memory** — remembers your place, marks chapters read, and offers a
  "Continue reading" shortcut. Stored locally in your browser.
- **Paragraph stepping** — press **Space** (or left-click the empty margin on
  either side of the text) to snap the next paragraph's first line to a fixed
  spot near the top, so you read straight down without hunting or swiping.
  **Shift+Space** steps back. In bilingual mode it snaps the *English*
  paragraphs (the translations ride along beneath).
- **Read aloud** — press **P** (or the floating **Listen** button) to have the
  book narrated from wherever you are. It highlights and snaps each paragraph
  as it reads, then auto-advances through parts like an audiobook. Uses your
  device's built-in **neural voices** via the Web Speech API — completely free,
  offline, no account, no loading. It auto-picks the best available voice for
  the current language (e.g. Samantha/Alex on a Mac, Meijia for Traditional
  Chinese, Google neural voices on Chrome); you can choose a different voice and
  the reading speed in the settings panel. Reads English in EN/雙語 mode and
  Traditional Chinese in 中文 mode.
- **Contents drawer** + keyboard nav (`←` / `→` between parts, `t` for contents).
- Fully responsive (desktop / mobile).

## Rebuilding the data

The source `.txt` files live in `~/Downloads/ug-krishnamurti-books/`. If you add
or replace a book, re-run:

```bash
python3 build.py
```

This regenerates `data.js`. The parser cleans OCR artifacts (re-wraps
paragraphs, collapses double-spaces, strips page numbers) and detects the
chapter/part structure of each book.

## Rebuilding the Chinese translation

The translation lives in `data.zh.js` and is keyed by stable IDs
(`b/<book>/<chapter>/<block>`, `ct/<book>/<chapter>`, etc.), so it survives
content edits. The pipeline:

```bash
python3 i18n/prep.py        # split data.js into i18n/chunks/*.json
#  -> translate each chunk to Traditional Chinese, writing i18n/out/<id>.json
python3 i18n/assemble.py    # merge i18n/out/*.json -> data.zh.js, report coverage
```

`assemble.py` prints coverage and lists any incomplete chunks, so the translate
step is fully resumable — only missing chunks need to be redone. It seeds from
the existing `data.zh.js` and `prep.py` skips already-translated keys, so the
pipeline is **incremental**: adding a new book only re-chunks and translates the
new content. The current edition is 100% translated (6,368 units of text).

## Note

These texts are the Internet Archive's auto-generated OCR of scanned editions,
so occasional character errors are expected. U.G. Krishnamurti (1918–2007)
placed all of his words in the public domain.
