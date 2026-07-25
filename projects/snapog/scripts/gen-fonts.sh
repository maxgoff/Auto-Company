#!/usr/bin/env bash
# Regenerate the bundled Latin-subset fonts in src/og/fonts/.
#
# Why these exist: workers-og downloads a font from fonts.googleapis.com on every
# cold isolate when no `fonts` option is passed to ImageResponse. That puts a
# third party in the critical path of every cold render. We bundle instead.
#
# Full Noto TTFs are ~2 MB for four faces; Latin-subset they are ~117 KB total.
#
# Requires: curl, and uvx (fonttools). Run from the project root:
#   ./scripts/gen-fonts.sh
#
# Fonts: Noto Sans and Noto Serif, SIL Open Font License 1.1 (redistribution and
# embedding permitted). Google Fonts serves TTF rather than WOFF2 to an old
# User-Agent, and Satori cannot read WOFF2 — hence the UA spoof below.

set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/src/og/fonts"
mkdir -p "$OUT"

# Latin + Latin-1 + the punctuation/arrows/bullets the templates actually use.
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,\
U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,\
U+2190,U+2192,U+2022,U+2018-201F,U+00B7"

fetch_and_subset() {
  local family="$1" weight="$2" outfile="$3"
  local css url tmp
  css=$(curl -s -H "User-Agent: Mozilla/4.0" \
    "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")
  url=$(printf '%s' "$css" | grep -oE 'https://[^)]*\.ttf' | head -1)
  if [ -z "$url" ]; then
    echo "FAILED to resolve TTF url for ${family} ${weight}" >&2
    exit 1
  fi
  tmp=$(mktemp /tmp/font-XXXX.ttf)
  curl -sL -o "$tmp" "$url"
  uvx --from fonttools pyftsubset "$tmp" \
    --unicodes="$UNICODES" \
    --output-file="$OUT/$outfile" \
    --layout-features="kern,liga" \
    --no-hinting \
    --desubroutinize
  echo "  $outfile = $(wc -c < "$OUT/$outfile") bytes (from $(wc -c < "$tmp"))"
  rm -f "$tmp"
}

echo "Generating Latin-subset fonts into $OUT"
fetch_and_subset "Noto+Sans"  400 "noto-sans-400.ttf"
fetch_and_subset "Noto+Sans"  700 "noto-sans-700.ttf"
fetch_and_subset "Noto+Serif" 400 "noto-serif-400.ttf"
fetch_and_subset "Noto+Serif" 700 "noto-serif-700.ttf"
echo "Total: $(cat "$OUT"/*.ttf | wc -c) bytes"
echo
echo "Any family referenced in src/og/templates.ts must be registered in the"
echo "FONTS array in src/og/render.ts, or Satori silently substitutes it."
