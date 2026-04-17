# @layermix/cli

## 2.0.0

### Major Changes

- Complete rewrite of `@layermix/cli` as a DAG-based task runner with an Ink TUI. The previous `0.x` line was a framework helper (codegen + AI enhancement); this `2.x` line is a generic task orchestrator. Existing users on `0.x` will be upgraded — the CLI surface is entirely different.

  - Define tasks + dependencies in `task-runner.json` (zod-validated, JSON-schema-backed for IDE autocompletion).
  - Parallel execution up to dependency constraints, with cascade-skip on failure and per-task retry from the TUI.
  - TUI with sidebar, live Gantt overview, and per-task streamed output; linear buffered output for CI/AI agents.
  - Subcommands: `init`, `list`, `validate`, `run` (default).
  - Auto-detects CI (`is-ci`) and coding-agent envs (Claude Code, Cursor, Aider, Continue) to switch to linear mode.
  - `--junit <path>` writes a JUnit XML report (works in both modes); `--dry-run-json` emits a machine-readable execution plan.
  - Monorepo-friendly: configs are discovered via `cosmiconfig` and merged upward through parent directories.
