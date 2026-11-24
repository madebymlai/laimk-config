# laimk-config

Personal agent configuration, one directory per tool:

- [`claude/`](claude/README.md): Claude Code settings, status line, and the `laimk` plugin.

The repository root is also a Claude Code plugin marketplace, so another machine can add it with `/plugin marketplace add madebymlai/laimk-config` and install `laimk@laimk-config`.
- [`pi/`](pi/README.md): pi extensions, skills, and theme ([setup](pi/SETUP.md)).
- [`antigravity/`](antigravity/README.md): Antigravity settings, status line, and the `laimk` plugin.

The three carry the same skills and scout, worker, reviewer, designer and researcher agents, each adapted to its tool. A change to one usually belongs in all three.
