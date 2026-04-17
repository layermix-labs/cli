---
"@layermix/cli": minor
---

Task arguments + TUI workflow upgrades:

- **Per-task positional inputs.** Tasks can declare `args` mapping `$1`, `$2`, ... in `cmd` to typed inputs: free `text`, `select` (one-of), `file` (glob-filtered file picker), and `folder` (glob-filtered directory picker). File/folder support `multiple` for checklist-style multi-select.
- **TUI args picker.** When a task with declared args is launched (Enter on the sidebar, or `layermix <task>` from the CLI), an overlay walks the user through each input in turn, with shell-quoted substitution into the final command.
- **Rerun + post-failure Run.** Success-with-args menus get a "Rerun" option (replays last args, no picker) — placed first so Enter does the expected thing. Failure-with-args menus get a "Run" option that re-opens the picker. "Run With Deps" is now hidden for tasks with no `dependsOn`.
- **CLI `--arg` flag.** Repeatable `-a/--arg <value>` for non-interactive runs. Comma-separated values feed multi-select args. Rejected when targeting more than one task (positional ambiguity).
- **Task search.** Press `/` in the TUI to filter the sidebar by task id; auto-expands matching groups/tags.
- **UI-only task groups.** Tasks sharing a `group` field render under a collapsible header in the sidebar, hidden from the flat task list. Pure UI — no CLI behavior.
- **Tag-scoped retry-failed.** "Retry Failed" inside a tag detail only resets failed tasks within that tag. New `force` option on `scheduleRun` re-runs already-completed tasks (used by tag re-run).
- **Queued state.** New `taskQueued` event flips tasks to a visible QUEUED status the moment they enter the pending set, so users see scheduled-but-not-started work.
