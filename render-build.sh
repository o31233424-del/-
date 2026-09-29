#!/bin/sh
set -eu
python3 - <<'PY'
import glob
import os
import shutil

cands = [f for f in glob.glob("*.html") if os.path.basename(f).lower() != "index.html"]
if not cands:
    raise SystemExit("No HTML app file found to copy to index.html")
src = cands[0]
shutil.copyfile(src, "index.html")
print("Copied", src, "-> index.html")
PY
