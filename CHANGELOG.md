# @layermix/cli

## 2.2.0

### Minor Changes

- 13eeb63: **`defaultRun` config field.** New top-level option that sets a CLI-style fallback target for non-TUI invocations:

  ```json
  "defaultRun": "-t test"        // tag selector
  "defaultRun": "build"          // single task id
  "defaultRun": "build deploy"   // multiple task ids
  ```

  Fires in any non-TUI run (`--ci`, `--ai`, auto-detected CI/AI env, or piped non-TTY shells) when no explicit target is supplied. TUI sessions stay idle so the explicit "pick what to run" UX is preserved. Explicit user targets always win over `defaultRun`.

  In CI/AI mode, this pre-empts the previous "run everything" fallback — invocations like `layermix --ci` now run only the configured target instead of the full graph. In piped non-CI mode, it pre-empts the "No tasks specified" hint.

- a70b42f: Task arguments + TUI workflow upgrades:

  - **Per-task positional inputs.** Tasks can declare `args` mapping `$1`, `$2`, ... in `cmd` to typed inputs: free `text`, `select` (one-of), `file` (glob-filtered file picker), and `folder` (glob-filtered directory picker). File/folder support `multiple` for checklist-style multi-select.
  - **TUI args picker.** When a task with declared args is launched (Enter on the sidebar, or `layermix <task>` from the CLI), an overlay walks the user through each input in turn, with shell-quoted substitution into the final command.
  - **Rerun + post-failure Run.** Success-with-args menus get a "Rerun" option (replays last args, no picker) — placed first so Enter does the expected thing. Failure-with-args menus get a "Run" option that re-opens the picker. "Run With Deps" is now hidden for tasks with no `dependsOn`.
  - **CLI `--arg` flag.** Repeatable `-a/--arg <value>` for non-interactive runs. Comma-separated values feed multi-select args. Rejected when targeting more than one task (positional ambiguity).
  - **Task search.** Press `/` in the TUI to filter the sidebar by task id; auto-expands matching groups/tags.
  - **UI-only task groups.** Tasks sharing a `group` field render under a collapsible header in the sidebar, hidden from the flat task list. Pure UI — no CLI behavior.
  - **Tag-scoped retry-failed.** "Retry Failed" inside a tag detail only resets failed tasks within that tag. New `force` option on `scheduleRun` re-runs already-completed tasks (used by tag re-run).
  - **Queued state.** New `taskQueued` event flips tasks to a visible QUEUED status the moment they enter the pending set, so users see scheduled-but-not-started work.

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
