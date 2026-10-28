#!/bin/sh
# Testrunde. Aufruf: sh scripts/test.sh (alles) oder sh scripts/test.sh --schnell (nur node-Tests, ohne Browser).
# Baut zuerst beide Stände, weil die Browser-Tests dist/ lesen. ui_tests.py läuft zuerst: es legt test/ui_out.* an, die andere Tests brauchen.
cd "$(dirname "$0")/.." || exit 1
fail=""
LOG="$(mktemp)" # eigenes Protokoll je Lauf, damit zwei Läufe (zwei Arbeitsordner) sich nicht überschreiben
run() { if "$@" > "$LOG" 2>&1; then echo "ok    $*"; else echo "ROT   $*"; tail -15 "$LOG"; fail="$fail $2"; fi; }

run node build.mjs
run node build.mjs elplexa
OUT="$(mktemp -d)"
for t in test/test_*.mjs; do run node "$t" "$OUT/$(basename "$t" .mjs).dxf"; done
if [ "$1" != "--schnell" ]; then
  run python3 test/ui_tests.py
  for t in test/*_tests.py; do [ "$t" = test/ui_tests.py ] || run python3 "$t"; done
fi
rm -rf "$OUT"
if [ -n "$fail" ]; then echo "Rot:$fail"; rm -f "$LOG"; exit 1; fi
rm -f "$LOG"
echo "Alle Tests grün."
