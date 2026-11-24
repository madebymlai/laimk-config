# laimk-config

Personal agent configuration, one directory per tool:

- [`claude/`](claude/README.md): Claude Code settings, status line, and the `laimk` plugin.
- [`pi/`](pi/README.md): pi extensions, skills, and theme ([setup](pi/SETUP.md)).
- [`antigravity/`](antigravity/README.md): Antigravity settings, status line, and the `laimk` plugin.

## Install

```sh
git clone https://github.com/madebymlai/laimk-config ~/git/laimk-config
```

Then follow each tool's guide: [Claude Code](claude/README.md), [pi](pi/SETUP.md), [Antigravity](antigravity/README.md). The installers point the tools at this checkout, so keep it in place, or rerun them after moving it. Claude Code can also take the plugin alone from GitHub, without a checkout.

The three carry the same skills and scout, worker, reviewer, designer and researcher agents, each adapted to its tool. A change to one usually belongs in all three.
