#!/bin/bash
# U.G. Krishnamurti — Reading Edition
# Double-click this file (macOS) to launch the reader in your browser.
# Or run it from a terminal:  ./start.command

cd "$(dirname "$0")" || exit 1

PORT=8777
# find a free port starting at 8777
while lsof -i :"$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:${PORT}/"
echo "────────────────────────────────────────────"
echo "  U.G. Krishnamurti — Reading Edition"
echo "  Serving at: ${URL}"
echo "  Press Ctrl-C in this window to stop."
echo "────────────────────────────────────────────"

# open the browser shortly after the server comes up
( sleep 1; open "$URL" ) &

# foreground server (Ctrl-C stops everything)
exec python3 -m http.server "$PORT"
