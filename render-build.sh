#!/bin/sh
set -eu
# Render serves index.html at the site root. Copy the app HTML under that name.
for f in *.html; do
  [ "$f" = "index.html" ] && continue
  cp -f "$f" index.html
  echo "Copied $f -> index.html"
  exit 0
done
echo "No HTML app file found to copy to index.html" >&2
exit 1
