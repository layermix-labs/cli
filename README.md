# @layermix/cli

DAG-based task runner. Define tasks + dependencies in a single JSON config, run them in parallel up to their dependency constraints, watch the graph stream in a TUI, or get clean linear output for CI.

```sh
npm i -g @layermix/cli
# or run ad-hoc
npx @layermix/cli init
```

---

## Quick start

```sh
# scaffold a task-runner.json + schema.json in the current dir
layermix init

# list tasks in the nearest config
layermix list

# validate the DAG (cycles, missing deps) and print execution layers
layermix validate

# run tasks (and their dependencies) — `run` is the default subcommand and can be omitted
layermix build                     # by id
layermix -t test                   # by tag
layermix run build compile         # explicit form, multiple ids
```

A bare `layermix` with no target opens an idle TUI in interactive shells, or prints a hint in linear mode. To auto-run everything, use `--ci`.

## Config (`task-runner.json`)

```json
{
  "$schema": "./schema.json",
  "tasks": [
    { "id": "clean",   "cmd": "rm -rf dist",            "dependsOn": [],                  "tags": ["build"], "description": "wipe dist/" },
    { "id": "compile", "cmd": "tsc",                    "dependsOn": ["clean"],           "tags": ["build"] },
    { "id": "lint",    "cmd": "eslint .",               "dependsOn": [],                  "tags": ["test"] },
    { "id": "test",    "cmd": "vitest run",             "dependsOn": ["compile", "lint"], "tags": ["test"] }
  ],
  "env": { "NODE_ENV": "development" },
  "tags": {
    "build": "produce a distributable",
    "test":  "validate the code"
  }
}
```

- `description` on a task is optional — shown in `list` output and in the TUI task header.
- Top-level `tags` is an optional `name → description` map — shown in `list` output and in the TUI tag detail header. Tags themselves are still declared per task in each task's `tags` array; this map just annotates them.
- `cwd` / `env` per task are optional. Task `env` merges on top of global `env`.
- Configs are discovered via [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig) and **merged upward** through parent directories: a nearer config overrides tasks of the same id in an outer config (useful in monorepos).
- `$schema: "./schema.json"` enables IDE autocompletion. The schema is shipped with the package; `layermix init` copies it into your project.

## Modes

### TUI (interactive)

When stdout is a TTY, `layermix` launches an Ink TUI:

- sidebar lists every task with live status (green / red / blue spinner / yellow)
- **Overview** tab — live Gantt waterfall with success/fail counts and bottleneck
- per-task tab — live-streamed stdout/stderr
- on a failed task: **Retry / Copy Logs / Close** menu — retry resets that task *and* all its downstream dependents

Quit with `Ctrl+C` or `Esc`.

### Linear (CI / agents)

`--ci`, `--ai`, or any non-TTY stdout: output is **buffered per task** and flushed only after a task finishes — so parallel execution doesn't garble logs. Task headers (`[task] Starting...` / `Finished (Success)` / `Failed` / `Skipped`) mark ordering.

CI mode is auto-detected via [`is-ci`](https://www.npmjs.com/package/is-ci) (common CI env vars: `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, etc.) or via the explicit `--ci` flag. AI-agent mode is detected from coding-agent env vars (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `CURSOR_TRACE_ID`, `AIDER_MODEL`, `AIDER_CHAT_HISTORY_FILE`, `CONTINUE_SESSION_ID`) or the explicit `--ai` flag; the generic `AI_AGENT` env var is a manual opt-in for anything unlisted.

In CI/AI mode, an empty target runs **all** tasks. In normal mode, an empty target runs nothing — pass task ids or `-t <tag>`.

## CLI reference

```
layermix [run] [taskIds...] [options]   # run is the default subcommand
layermix list                            # human-readable task dump
layermix validate                        # confirms DAG is cycle-free + prints layers
layermix init [--force]                  # scaffold task-runner.json + schema.json
```

`run` flags:

| Flag | Meaning |
|------|---------|
| `-t, --tag <tag>` | run all tasks carrying this tag (and their deps) |
| `--concurrency <n>` | cap parallelism (defaults to CPU count) |
| `--output-only-failed` | linear mode: only print logs for failed tasks |
| `--ci` | force linear mode, auto-run all tasks if no target |
| `--ai` | alias for `--ci` |
| `--junit <path>` | write a JUnit XML report on exit |
| `--dry-run-json` | print the execution plan as JSON, run nothing |

### Exit codes

| Code | Meaning |
|------|---------|
| 0    | All targeted tasks succeeded |
| 1    | One or more tasks failed (or were skipped due to a failed dep), or config/validation error |

## For CI / AI agents

### Dry-run plan

```sh
layermix run --dry-run-json [taskIds...] [-t <tag>]
```

Output shape:

```json
{
  "root": "/abs/path/to/config/root",
  "executionPlan": [["a"], ["b", "c"], ["d"]],
  "tasks": {
    "a": {
      "id": "a",
      "cmd": "echo hi",
      "cwd": "/abs/path",
      "env": { "NODE_ENV": "development" },
      "dependsOn": [],
      "dependencies": [],
      "tags": ["build"]
    }
  }
}
```

- `executionPlan` — layered topological sort over the **target subset** (task ids or `-t` tag filter, plus transitive upstream deps). Each inner array can run in parallel; layer N waits on layer N-1.
- `tasks[id].cwd` — absolute working directory the command will run in.
- `tasks[id].env` — fully resolved env from config (global `env` merged with the task's own `env`; `process.env` is *not* included here but is inherited at run time).
- `tasks[id].dependsOn` — direct deps as declared.
- `tasks[id].dependencies` — full transitive closure of upstream deps.

No processes are spawned during dry-run.

### JUnit report

Pass `--junit <path>` to write a [JUnit XML](https://llg.cubic.org/docs/junit/) report on exit. Each task becomes a `<testcase>`; failures carry `<failure>` with the captured stderr inside CDATA; dependency-skipped tasks carry `<skipped>`. Works in both TUI and linear modes; parent directories are created if missing.

```sh
layermix run --junit report.xml -t test
```

**GitHub Actions** — consume via any of the community JUnit reporters (e.g. [`dorny/test-reporter`](https://github.com/dorny/test-reporter), [`mikepenz/action-junit-report`](https://github.com/mikepenz/action-junit-report)).

**GitLab CI** — consumed natively via [`artifacts:reports:junit`](https://docs.gitlab.com/ci/yaml/artifacts_reports/#artifactsreportsjunit); per-task results show up in the MR widget with failure output inline:

```yaml
test:
  script:
    - npx @layermix/cli -t test --junit report.xml
  artifacts:
    when: always
    reports:
      junit: report.xml
```

The `classname` attribute is the task's tags joined by `.` (or `task` if untagged), and the `name` is the task id — so CI UIs that group by classname will bucket tasks under their tag.

## License

[MIT](./LICENSE)
