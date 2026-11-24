# antigravity-config

Personal Antigravity settings, skills, and subagents: the Antigravity
counterpart of [claude-config](https://github.com/madebymlai/claude-config).

The `laimk` plugin in `plugins/laimk/` carries the same skills and the scout,
worker, reviewer, designer and researcher subagents, with tool names mapped to
Antigravity's (`read_file`, `edit_file`, `write_file`, `run_command`,
`manage_task`, `search_web`).

## Install the status line only

Requires Bash, `jq`, Python 3, and a terminal font with Powerline glyphs.

```sh
./setup-statusline.sh
```

This replaces only `statusLine` in `~/.gemini/antigravity-cli/settings.json`.
The command points at `statusline.py` in this checkout; rerun the installer
after moving it. The row matches claude-config's: model and effort (omitted
when the model label already names it), `↑` input and `↓` output tokens in the
current context, a ten-cell context bar, and the directory and Git branch when
space permits. See [Status line customization](https://antigravity.google/docs/cli/statusline)
for the JSON the CLI sends.

## Install all personal settings

```sh
./setup-settings.sh
```

This installs the status line, then merges:

- **`~/.gemini/antigravity-cli/settings.json`**: maximum permissions
  (`toolPermission: always-proceed`, `agentMode: accept-edits`,
  `artifactReviewPolicy: always-proceed`, non-workspace access on, terminal
  sandbox off, and allow rules `read_file(*)`, `write_file(*)`, `read_url(*)`,
  `execute_url(*)`, `command(*)`, `mcp(*)`), plus model and display
  preferences. Existing allow rules are kept; deny and ask rules still apply,
  since Antigravity evaluates deny > ask > allow.
- **`~/.gemini/config/config.json`**: the App/IDE Turbo permission preset and
  the `laimk` plugin enabled.
- **`~/.gemini/config/plugins/laimk`**: a symlink to this checkout's plugin, so
  edits here take effect on the next `agy` start. Rerun after moving the checkout.

Other keys are preserved. The CLI rewrites `settings.json` in its own format at
startup, dropping keys set to their defaults. Restart `agy` to pick up changes.

## Verify

```sh
python3 -B -m unittest discover -s tests -v
bash -n setup-settings.sh setup-statusline.sh
agy plugin validate plugins/laimk --strict
```

Tests run the installers against a temporary `HOME`; they do not modify your
Antigravity configuration.
