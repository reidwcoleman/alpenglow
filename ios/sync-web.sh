#!/bin/sh
# Builds the game and copies it into ios/Web, the offline copy bundled in the app (the app
# plays the live site when it's online and falls back to this). Run before building the app.
set -e
cd "$(dirname "$0")/.."
npx vite build --outDir dist-app --emptyOutDir >/dev/null
mkdir -p ios/Web
rsync -a --delete dist-app/ ios/Web/
echo "ios/Web: $(du -sh ios/Web | cut -f1)"
