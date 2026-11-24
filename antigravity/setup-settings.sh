#!/usr/bin/env bash
# Merge laimk's Antigravity settings:
#   ~/.gemini/antigravity-cli/settings.json  CLI preferences and maximum permissions
#   ~/.gemini/config/config.json             App/IDE permission preset, laimk plugin enabled
#   ~/.gemini/config/plugins/laimk           symlink to this checkout's plugin
# The keys below overwrite the same keys there; every other key is kept, and
# permission allow rules are added to the existing ones. Also installs the
# shared Powerline status line. Safe to run again.
set -euo pipefail

command -v jq >/dev/null || { echo "setup-settings: jq is required" >&2; exit 1; }

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cli_settings=$HOME/.gemini/antigravity-cli/settings.json
config_dir=$HOME/.gemini/config

"$repo/setup-statusline.sh"

cli=$(cat <<'JSON'
{
  "$schema": "https://antigravity.google/schemas/v1/settings.json",
  "agentMode": "accept-edits",
  "toolPermission": "always-proceed",
  "artifactReviewPolicy": "always-proceed",
  "allowNonWorkspaceAccess": true,
  "enableTerminalSandbox": false,
  "model": "Gemini 4 Hydrogen (XHigh)",
  "altScreenMode": "always",
  "notifications": true,
  "showTips": false,
  "showFeedbackSurvey": false
}
JSON
)

allow='["read_file(*)", "write_file(*)", "read_url(*)", "execute_url(*)", "command(*)", "mcp(*)"]'

app=$(cat <<'JSON'
{
  "userSettings": {
    "permissionPreset": "AGENT_PERMISSION_PRESET_TURBO",
    "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER",
    "nonWorkspaceFileAccessPolicy": "AGENT_SETTING_POLICY_ALLOW",
    "enableTerminalSandbox": false
  },
  "plugins": {
    "laimk": { "enabled": true }
  }
}
JSON
)

# merge FILE PERMS JQ_FILTER [jq args...]: rewrite FILE through the filter.
merge() {
  local target=$1 perms=$2 filter=$3
  shift 3
  mkdir -p "$(dirname "$target")"
  [[ -f $target ]] || echo '{}' >"$target"
  local tmp
  tmp=$(mktemp "$target.XXXXXX")
  jq "$@" "$filter" "$target" >"$tmp" || { rm -f "$tmp"; exit 1; }
  chmod "$perms" "$tmp"
  mv "$tmp" "$target"
  echo "setup-settings: merged into $target"
}

merge "$cli_settings" 600 '
  . * $ours
  | .permissions.allow = (((.permissions.allow // []) + $allow) | unique)
' --argjson ours "$cli" --argjson allow "$allow"

merge "$config_dir/config.json" 644 '. * $ours' --argjson ours "$app"

# The laimk plugin loads from this checkout, wherever it is.
link=$config_dir/plugins/laimk
if [[ -e $link && ! -L $link ]]; then
  echo "setup-settings: $link exists and is not a symlink; move it aside first" >&2
  exit 1
fi
mkdir -p "$config_dir/plugins"
ln -sfn "$repo/plugins/laimk" "$link"
echo "setup-settings: linked $link -> $repo/plugins/laimk"
