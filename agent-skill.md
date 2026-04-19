---
name: layermix
description: Run, plan, and debug tasks defined in a layermix `task-runner.json`. Use whenever the repo contains a `task-runner.json` (or any config named after cosmiconfig's `task-runner` lookups) and the user asks to build, test, lint, validate, or otherwise execute project tasks.
---

# Layermix task runner

This project uses [`@layermix/cli`](https://www.npmjs.com/package/@layermix/cli) (binary: `layermix`) to orchestrate tasks as a DAG. One JSON file declares tasks, dependencies, tags, and groups; the CLI runs them with correct ordering and parallelism.

**Before running anything:** read `task-runner.json` at the repo root (or up the tree — configs merge upward through parent dirs, closer wins). That file is the source of truth for what tasks exist, what they do, and how they depend on each other. Don't guess task ids.

## How to invoke

```sh
layermix <id> [<id>...]        # run one or more tasks by id (plus their transitive deps)
layermix -t <tag>              # run every task carrying <tag> (plus their deps)
layermix list                  # human-readable dump of every task, tag, group
layermix validate              # check the DAG is cycle-free; prints execution layers
layermix run --dry-run-json    # print the execution plan as JSON, run nothing
```

`run` is the default subcommand, so `layermix build` === `layermix run build`.

**A bare `layermix` with no target fails in CI/AI mode (exit 1).** In a piped non-CI shell it prints a yellow hint and exits 0; in the TUI it opens idle. Always pass an explicit target. If the config defines `defaultRun`, that's what empty invocations resolve to in non-TUI modes — check for it before assuming "nothing runs".

**Unknown task ids or tags also exit 1 in every mode.** `layermix buildd` (typo) and `layermix -t teest` no longer silently succeed — they print `Error: Unknown task: "buildd"` / `Error: No tasks match tag "teest"` on stderr and exit 1. When scripting, rely on the exit code; the task name you passed is echoed back in the error so typos surface immediately.

## AI-agent etiquette

- **Force linear mode with `--ai`** when running from a coding-agent context. That makes output buffered per task (no interleaved parallel stdout) and drops the Ink TUI. `--ci` is an alias. Most coding agents (Claude Code, Cursor, Aider, Continue) are auto-detected via env vars, so `--ai` is often redundant — but it's cheap insurance.
- **Prefer `layermix validate` or `layermix run --dry-run-json <target>`** before executing anything unfamiliar. The dry-run JSON tells you exactly what will run, in what layers, with resolved `cwd` + `env` + the transitive dep closure — no processes spawned.
- **Always pass explicit targets.** Running `layermix --ai` with no target used to execute the whole pipeline; that was removed precisely because it's dangerous in unfamiliar repos. If you want "everything CI runs", look for a `test` tag (or similar) — don't fall back to "run all".
- **Don't parse stdout for results.** Use `--junit <path>` to get machine-readable per-task status, duration, and captured stderr on failure. Works in both TUI and linear modes.
- **Exit codes:** `0` = every targeted task succeeded; `1` = task failure, cascade skip, unknown task id/tag, config/validation error, *or* `--ci`/`--ai` with no explicit target and no `defaultRun`. Check exit code, not stdout — agents in CI/AI mode can't silently succeed with nothing done.

## Reading `task-runner.json`

Per-task shape:

```json
{
  "id": "test",                         // canonical handle — use this in CLI, dependsOn, JUnit
  "cmd": "vitest run",                  // shell command; may reference $1, $2, ... from args
  "label": "Vitest suite",              // optional cosmetic display name
  "dependsOn": ["compile", "lint"],     // waits for these task ids
  "tags": ["test"],                     // array; `layermix -t test` targets it
  "group": "quality",                   // single string; UI-only, no CLI surface
  "cwd": "./packages/app",              // per-task override
  "env": { "NODE_ENV": "test" },        // merged over top-level env
  "args": [ /* positional inputs */ ],  // see below
  "description": "..."
}
```

Top-level:

- `env` — applied to every task; task-local `env` wins on conflict.
- `tags` / `groups` — `{ name: description }` maps that annotate tag/group names (membership still lives on each task).
- `defaultRun` — CLI-style fallback target for empty invocations in non-TUI modes (e.g. `"-t test"` or `"build deploy"`). Explicit targets from the command line always win.

**Tags vs groups:** tags are the *CLI* grouping (`-t <tag>` runs the tag). Groups are UI-only — they just reorganise the TUI sidebar. When the user says "run the test suite", look for a `test` tag, not a `test` group.

## Task arguments (`args`)

A task can declare positional inputs referenced as `$1`, `$2`, ... in its `cmd`. Pass them from the CLI with `-a` / `--arg` (repeatable, in declared order):

```sh
layermix test-file -a "src/foo.test.ts" -a "cycle detection"
layermix lint-files -a "src/a.ts,src/b.ts"   # multi-select: comma-separated
```

Types: `text`, `select`, `file`, `folder`. File/folder values are resolved against the task's `cwd` (or config root). `--arg` only works for single-task targets (no unambiguous mapping otherwise). Text/select fall back to the declared `default`; file/folder require a value.

## Common playbook

| Goal | Command |
|------|---------|
| Run the CI quality gate | `layermix -t test --ai` (look for a `test`-ish tag in the config) |
| Plan before running | `layermix run --dry-run-json <target>` — emit JSON, run nothing |
| One task + fresh upstream | `layermix <id> --ai` (deps re-run only if not yet run this session; in one-shot CLI mode that means from scratch) |
| Machine-readable CI report | `layermix -t test --ai --junit report.xml` |
| Parallelism cap | `--concurrency <n>` (default = CPU count) |
| Only log failures | `--output-only-failed` in linear mode |

## Failure handling

When a task fails, every downstream dependent cascade-skips — they appear as `SKIPPED` in JUnit and exit code is `1`. To debug:

1. Read the failing task's logs (linear mode prints them inline; `--output-only-failed` isolates them).
2. If you need the full transitive dep graph of a failure, run `layermix run --dry-run-json <failing-id>` — the `dependencies` field lists every upstream task that was built first.
3. Fix the root failure first; re-running from the CLI will re-run the task and its upstream deps. The TUI has more granular retry (scoped "retry failed" per tag) but that's not available in one-shot CLI mode.

## Gotchas

- **Config discovery walks upward.** In a monorepo, a `task-runner.json` in a subpackage merges with one at the root; closer wins per-task-id. If a task "disappears", check whether an outer config's task of the same id is being shadowed.
- **`cmd` runs in a shell** (`execa` with `shell: true`), per-task `cwd`, with `process.env` + global `env` + task `env` merged in that order.
- **Don't edit `dist/` if it exists in the repo** — the runtime is `vite-node` on `src/`. `dist/` is stale build output.
- **`$schema` at the top of `task-runner.json` is real** — it points to a versioned schema on Unpkg. IDEs use it for autocomplete; leave it alone unless bumping the CLI version.
