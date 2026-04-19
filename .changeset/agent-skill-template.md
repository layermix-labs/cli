---
"@layermix/cli": patch
---

docs: add agent skill template for downstream projects

New `agent-skill.md` at the repo root — a copy-paste Claude Code skill (with YAML frontmatter) that teaches coding agents how to use `layermix` correctly in projects that consume the CLI: which flags are safe, how to read `task-runner.json`, when to prefer `--dry-run-json`, how to interpret exit codes. README.md gains an "Agent skill template" subsection under "For CI / AI agents" with a one-liner `curl` to drop it into `.claude/skills/layermix/SKILL.md`. Not shipped in the npm tarball — pulled from GitHub directly.
