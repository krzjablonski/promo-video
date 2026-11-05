#!/usr/bin/env bash
# Scaffolds a promo-video project from the skill template.
#   new-project.sh <target-dir> [--no-install]
# Refuses to overwrite an existing non-empty directory.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?usage: new-project.sh <target-dir> [--no-install]}"
if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "✗ $TARGET exists and is not empty — not overwriting. Pick another folder or update that project in place." >&2
  exit 1
fi
mkdir -p "$TARGET"
cp -R "$SKILL_DIR/template/." "$TARGET/"
echo "✓ Template copied to $TARGET"
if [ "${2:-}" != "--no-install" ]; then
  (cd "$TARGET" && npm ci --no-audit --no-fund --loglevel=error)
  echo "✓ Dependencies installed"
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  echo "⚠ Node $(node -v): the scripts import TypeScript directly and need Node 22.18+." >&2
fi
command -v ffmpeg >/dev/null || echo "⚠ No system ffmpeg; scripts fall back to Remotion's bundled copy."
[ -x "${PROMO_WHISPER_DIR:-$HOME/.cache/promo-video/whisper}/main" ] || echo "· whisper.cpp is not built yet; the first 'npm run sync' builds it (~1 min, needs git + make; on Windows it downloads a ready-made copy)."
