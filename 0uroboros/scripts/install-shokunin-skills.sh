#!/usr/bin/env bash
# Install a Cursor-native, 0uroboros-curated subset of Shokunin skills.
#
# Do not use the upstream installers for this repo:
#   install.sh          -> OpenCode + WezTerm + ChromaDB (Windows/Linux)
#   install-skills.sh   -> ~/.config/opencode/skills (Cursor never reads that path)
#
# Cursor loads project skills from .cursor/skills/<name>/SKILL.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/.cursor/skills"
SOURCE="https://github.com/EliasOulkadi/shokunin.git"
# Upstream advertises v4.2.3 but that tag is not on the remote. Pin master
# unless SHOKUNIN_REF is set. SOURCE.md records the resolved commit.
PINNED_REF="${SHOKUNIN_REF:-master}"
WORK_DIR="${TMPDIR:-/tmp}/shokunin-0uroboros"

# Skills that match this React / Three.js / boardgame.io table, plus Phase 2 hooks.
SKILLS=(
  api-forge
  auth-architect
  code-review
  component-forge
  comprehensive-review
  documentation
  efficient-coding
  emil-design-eng
  error-handler
  find-skills
  git-workflow
  impeccable
  motion-craft
  performance-profiler
  plan
  playwright
  responsive-engine
  senior-engineer
  taste
  test-commander
  ui-ux-pro-max
  web-security
)

# Custom skills authored in this repo. The upstream clone does not contain them.
# Leave these directories in place when refreshing the curated upstream set.
LOCAL_SKILLS=(
  boardgame-io
  youtube-full
  youtube-watch
)

mkdir -p "$SKILLS_DIR"
rm -rf "$WORK_DIR"

echo "Cloning Shokunin ($PINNED_REF)..."
if ! git clone --depth 1 --branch "$PINNED_REF" "$SOURCE" "$WORK_DIR" 2>/dev/null; then
  echo "Tag $PINNED_REF not found, cloning master..."
  git clone --depth 1 "$SOURCE" "$WORK_DIR"
fi

RESOLVED_REF="$(git -C "$WORK_DIR" rev-parse --short HEAD)"
SOURCE_PACK="$WORK_DIR/.pack/skills"

if [ ! -d "$SOURCE_PACK" ]; then
  echo "FAIL: $SOURCE_PACK is missing." >&2
  exit 1
fi

COPIED=0
MISSING=0
for name in "${SKILLS[@]}"; do
  if printf '%s\n' "${LOCAL_SKILLS[@]}" | grep -qx "$name"; then
    echo "SKIP: $name is a local skill"
    continue
  fi
  src="$SOURCE_PACK/$name"
  if [ ! -f "$src/SKILL.md" ]; then
    echo "WARN: $name has no SKILL.md, skipped"
    MISSING=$((MISSING + 1))
    continue
  fi
  rm -rf "$SKILLS_DIR/$name"
  mkdir -p "$SKILLS_DIR/$name"
  cp -R "$src"/. "$SKILLS_DIR/$name/"
  COPIED=$((COPIED + 1))
done

cat > "$SKILLS_DIR/SOURCE.md" <<EOF
# Shokunin skills in this project

Upstream: https://github.com/EliasOulkadi/shokunin
Requested ref: $PINNED_REF
Resolved commit: $RESOLVED_REF
Installed: $(date -u +%Y-%m-%d)

This is a curated subset for 0uroboros, not the full 62-skill pack.
Refresh with \`scripts/install-shokunin-skills.sh\`.

Local skills (not overwritten): ${LOCAL_SKILLS[*]}
EOF

rm -rf "$WORK_DIR"
echo "Installed $COPIED skills into .cursor/skills (missing: $MISSING)"
echo "Resolved commit: $RESOLVED_REF"
