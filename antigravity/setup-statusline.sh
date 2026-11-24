#!/usr/bin/env bash
# Install only the Powerline status line into the Antigravity CLI settings
# (~/.gemini/antigravity-cli/settings.json); preserve every unrelated setting.
# Like setup-settings.sh, this points at the checkout and is safe to run again.
set -euo pipefail

command -v jq >/dev/null || { echo "setup-statusline: jq is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "setup-statusline: python3 is required" >&2; exit 1; }

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cli_dir=$HOME/.gemini/antigravity-cli
settings=$cli_dir/settings.json

mkdir -p "$cli_dir"
[[ -f $settings ]] || echo '{}' >"$settings"

tmp=$(mktemp "$settings.XXXXXX")
trap 'rm -f "$tmp"' EXIT

jq --arg script "$repo/statusline.py" '
  .statusLine = {
    type: "command",
    command: ("python3 " + ($script | @sh))
  }
' "$settings" >"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$settings"

echo "setup-statusline: installed in $settings"
