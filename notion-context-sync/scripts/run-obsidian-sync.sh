#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm)}"
SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

cd "$PROJECT_DIR"
mkdir -p logs

{
  echo "=== notion-context obsidian sync start $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
  "$PNPM_BIN" pull
  "$PNPM_BIN" export-obsidian
  echo "=== notion-context obsidian sync done $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
} >> logs/obsidian-sync.log 2>&1
