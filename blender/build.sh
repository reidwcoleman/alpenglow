#!/bin/sh
# Build every Blender asset: models them headless, bakes their shading, exports and meshopt-packs
# them into public/models. Needs Blender 5.2 on the PATH (brew install --cask blender).
set -e
cd "$(dirname "$0")/.."
node blender/export_layout.mjs >/dev/null
node tools/dumpprops.mjs >/dev/null
for s in ${@:-rider gear rails village}; do
  echo "== $s"
  blender -b --python "blender/$s.py" 2>&1 | grep -E "wrote|packed|Error|Traceback|line [0-9]+" || true
done
ls -la public/models
