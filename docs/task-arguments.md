---
title: Task arguments
---

# Task arguments

[Home](./index.md)

A task can declare positional input slots that get substituted into its `cmd` at run time. In the TUI, each slot opens a picker (text prompt, select list, file picker, or folder picker). On the CLI, pass values with `-a` / `--arg`.

## Declaring args

```json
{
  "id": "test-file",
  "cmd": "vitest run $1 -t $2",
  "args": [
    { "type": "file", "label": "Test file", "glob": "**/*.test.ts" },
    { "type": "text", "label": "Test name pattern", "default": "" }
  ]
}
```

The `cmd` references each slot by its 1-indexed position: `$1` is the first arg, `$2` the second, and so on. At run time, `layermix` collects each value, shell-quotes it, and substitutes it into the command.

## Input types

| Type | Picker | Options |
|------|--------|---------|
| `text` | Free-form text input | `default` (string) |
| `select` | Pick one from a list | `choices` (string[]), `default` |
| `file` | Glob-filtered file picker | `glob` (defaults to `**/*`), `multiple` (checklist mode) |
| `folder` | Glob-filtered directory picker | `glob`, `multiple` |

`label` is shown in the picker prompt. It falls back to `Argument $N` if omitted.

## TUI flow

Pressing Run on a task with declared args opens a modal that walks each input in turn. Enter advances to the next slot, Esc cancels. After submission, the task queues and the sidebar selection auto-jumps to it, so logs stream into view as it runs.

After a successful run, the task detail menu gets a Rerun option that replays the same args without re-prompting. After a failure, the menu gets a Run option that re-opens the picker, so you can change the inputs that caused the failure.

## CLI flow

Pass values positionally with `-a` / `--arg`, repeatable in declared order:

```sh
layermix test-file -a "src/foo.test.ts" -a "cycle detection"
```

Multi-select args take a comma-separated value:

```sh
layermix lint-files -a "src/a.ts,src/b.ts"
```

`--arg` only works for single-task targets. Using it with a tag or multiple ids is ambiguous (no way to map positional values to a target), and fails with an error.

When a value is omitted, the declared `default` kicks in. Text and select defaults are honoured. File and folder args have no default and require a value.

## Path resolution

`file` and `folder` paths are resolved against the task's `cwd` if set, otherwise against the config root (the directory containing `task-runner.json`). For multi-select args, paths are joined with spaces, each shell-quoted independently.

## See also

- [task-runner.json reference](./config.md)
- [Terminal UI guide](./tui.md)
