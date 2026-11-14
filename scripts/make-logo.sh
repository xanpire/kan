#!/bin/sh
# Renders the app icons and the in-app mark from assets/logo/*.svg (decided 14 Nov 2026).
# App icon: the vulture head, black on a flat red tile, no glow. In-app: the soaring vulture, red, transparent.
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
HEAD=$(sed -n 's/.*\(<g id="head">.*<\/g>\)<\/svg>/\1/p' assets/logo/head.svg)
tile() { # $1 = transform for the head inside a 200 box, $2 = background (or none)
  bg=''; [ "$2" != none ] && bg="<rect width=\"200\" height=\"200\" fill=\"$2\"/>"
  echo "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">$bg<g transform=\"$1\">$HEAD</g></svg>"
}
tile 'translate(0,10)' '#E50914' > "$T/icon.svg"
tile 'translate(20,48) scale(0.8)' '#E50914' > "$T/maskable.svg"
tile 'translate(34,75) scale(0.66)' none > "$T/adaptive.svg"
SOAR=assets/logo/soaring.svg
r() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }
r "$T/icon.svg" 1024 assets/images/icon.png
r "$T/adaptive.svg" 1024 assets/images/adaptive-icon.png
r "$T/icon.svg" 48 assets/images/favicon.png
r "$T/icon.svg" 192 public/icon-192.png
r "$T/icon.svg" 512 public/icon-512.png
r "$T/maskable.svg" 512 public/icon-maskable-512.png
r "$T/icon.svg" 180 public/apple-touch-icon.png
r "$SOAR" 96 assets/images/vulture-mark.png
r "$SOAR" 512 assets/images/vulture-mark-large.png
rm -rf "$T"
