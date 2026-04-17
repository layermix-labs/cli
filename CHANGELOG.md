# @layermix/cli

## 2.1.0

### Minor Changes

- 9065b7c: TUI improvements:

  - **Keyboard navigation:** added single-key shortcuts (`r`, `R`, `c`, `K`, `x`) for the TaskDetail action menu, plus arrow/`h`/`l` cycling and `Enter` to activate.
  - **UX polish:** clearer overview waterfall, refreshed sidebar/tag/task layout, and improved status visibility in the top bar.
  - **Performance:** drastically reduced TUI flicker for chatty tasks. Stdout chunks are now coalesced into one render per ~16ms frame, the Overview duration ticker only runs while tasks are active, and the log pane reuses rows on scroll/tail instead of remounting them. A 5000-line per-task log buffer keeps memory bounded for long-running tasks.

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
