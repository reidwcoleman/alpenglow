#!/bin/sh
# Build every Blender asset: models them headless, bakes their shading, exports and meshopt-packs
# them into public/models; then renders the occlusion on what the game still builds itself (bake).
# Needs Blender 5.2 on the PATH (brew install --cask blender) and the dev server up on 5260.
set -e
cd "$(dirname "$0")/.."
node blender/export_layout.mjs >/dev/null
node tools/dumpprops.mjs >/dev/null
node tools/dumpbake.mjs >/dev/null
for s in ${@:-rider gear rails village lift props bake}; do
  echo "== $s"
  blender -b --python "blender/$s.py" 2>&1 | grep -E "wrote|packed|baked|Error|Traceback|line [0-9]+" || true
done
ls -la public/models
