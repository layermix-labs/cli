---
title: CLI reference
---

# CLI reference

[Home](./index.md)

## Subcommands

```
layermix [run] [taskIds...] [options]   # run is the default subcommand
layermix list                            # human-readable task dump
layermix validate                        # confirms DAG is cycle-free, prints layers
layermix init [--force]                  # scaffold task-runner.json
```

`run` is the default, so `layermix build` and `layermix run build` are the same.

## `run` flags

| Flag | Meaning |
|------|---------|
| `-t, --tag <tag>` | Run all tasks with this tag (and their deps). |
| `-a, --arg <value>` | Positional value for the target task's `args[i]`. Repeat in declared order. Comma-separated for multi-select file/folder args. Single-task targets only. |
| `--concurrency <n>` | Cap parallelism. Defaults to CPU count. |
| `--output-only-failed` | Linear mode only. Suppress logs for successful tasks. |
| `--ci` | Force linear mode. Empty target with no `defaultRun` exits 1. |
| `--ai` | Alias for `--ci`. |
| `--junit <path>` | Write a JUnit XML report on exit. |
| `--dry-run-json` | Print the execution plan as JSON. Run nothing. |

## `init` flags

| Flag | Meaning |
|------|---------|
| `-f, --force` | Overwrite an existing `task-runner.json`. |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Every targeted task succeeded. Or (piped non-CI only) no target was specified and no `defaultRun` is configured: a hint is printed. |
| 1 | A task failed, or cascade-skipped because of a failed dep. Or an unknown task id / tag was targeted. Or config / validation failed. Or `--ci` / `--ai` was used with no explicit target and no `defaultRun`. |

## See also

- [task-runner.json reference](./config.md)
- [CI and AI agents](./ci-and-agents.md)
- [Scenarios](./scenarios.md)
