#!/usr/bin/env bash
set -euo pipefail
# Run from this specimen directory. Pass the Akribos repository root.
repo_root="${1:?usage: bash build.sh /path/to/akribos}"
python_bin="${PYTHON_BIN:-python3}"
"$python_bin" prepare-fonts.py "$repo_root"
for style in A B C; do
  typst compile --font-path fonts --ignore-system-fonts --input "style=$style" \
    --creation-timestamp 1790035200 specimen.typ "variante-$style.pdf"
  pdftoppm -f 1 -singlefile -scale-to 1200 -png "variante-$style.pdf" "variante-$style-vorschau"
done
typst compile --font-path fonts --ignore-system-fonts \
  --creation-timestamp 1790035200 umbruchprobe.typ umbruchprobe.pdf
