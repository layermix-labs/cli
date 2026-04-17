# my-runner

DAG-based task runner CLI. Define tasks + dependencies in a JSON config, run them in parallel up to their dependency constraints, watch the graph stream in a TUI or get linear output for CI.

---

## For Humans

### Install

```sh
pnpm install
```

Entry is `npm start` (runs the source via `vite-node` — no prebuild).

### Quick start

```sh
# scaffold a task-runner.json + schema.json in the current dir
npm start -- init

# list tasks in the nearest config
npm start -- list

# validate DAG (cycles, missing deps) and print execution layers
npm start -- validate

# run tasks (and their dependencies) — `run` is the default command, can be omitted
npm start -- build                     # by id
npm start -- -t test                   # by tag
npm start                              # no target: opens idle TUI (or prints a hint in linear mode). Use --ci to auto-run everything.
npm start -- run build                 # explicit form also works

# CI / AI-agent / non-TTY
npm start -- --ci --output-only-failed
npm start -- --ci                      # forces linear output and auto-runs all tasks when no target is given
npm start -- --ai                      # alias for --ci; intended for use from coding agents
CI=true npm start                      # auto-detected via is-ci; same effect as --ci
CLAUDECODE=1 npm start                 # auto-detected AI-agent mode; same effect as --ai
npm start -- --junit report.xml        # write JUnit XML report on exit (works in both TUI and linear modes)
```

CI mode is detected via [`is-ci`](https://www.npmjs.com/package/is-ci) (common CI env vars: `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, etc.) or the explicit `--ci` flag. AI-agent mode is detected from common coding-agent env vars (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `CURSOR_TRACE_ID`, `AIDER_MODEL`, `AIDER_CHAT_HISTORY_FILE`, `CONTINUE_SESSION_ID`) or the explicit `--ai` flag; the generic `AI_AGENT` env var is a manual opt-in for anything unlisted. Any of these paths forces linear output (no TUI even on a TTY) and treats an empty target as "run everything". In non-CI/AI mode, an empty target runs nothing — specify task ids or `-t <tag>`. For machine-readable results, pass `--junit <path>` to write a JUnit XML report (see below).

### Config (`task-runner.json`)

```json
{
  "$schema": "./schema.json",
  "tasks": [
    { "id": "clean",   "cmd": "rm -rf dist",         "dependsOn": [],                "tags": ["build"], "description": "wipe dist/" },
    { "id": "compile", "cmd": "tsc",                 "dependsOn": ["clean"],         "tags": ["build"] },
    { "id": "lint",    "cmd": "eslint .",            "dependsOn": [],                "tags": ["test"] },
    { "id": "test",    "cmd": "vitest run",          "dependsOn": ["compile","lint"],"tags": ["test"] }
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
- Configs are discovered via `cosmiconfig` and **merged upward** through parent directories: a nearer config overrides tasks of the same id in an outer config (useful in monorepos).
- `$schema: "./schema.json"` enables IDE autocompletion. Regenerate with `npx vite-node scripts/generate-schema.ts`.

### TUI

When stdout is a TTY, `run` launches an Ink TUI:

- sidebar lists every task (green/red/blue-spinner/yellow)
- **Overview** tab — live Gantt waterfall + success/fail counts + bottleneck
- per-task tab — live-streamed stdout/stderr
- on a failed task: **Retry / Copy Logs / Close** menu (retry resets that task *and* all its downstream dependents)

Quit with `Ctrl+C` or `Esc`.

### Linear mode

`--ci`, or any non-TTY stdout: output is **buffered per task** and flushed only after a task finishes — so parallel execution doesn't garble logs. Task headers (`[task] Starting...` / `Finished (Success)` / `Failed` / `Skipped`) mark ordering.

### Tests

```sh
npm test                                              # all
npx vitest run src/core/__tests__/task-graph.test.ts  # one file
npx vitest run -t "cycle detection"                   # one test name
```

---

## For AI Agents

### Discover the plan without running it

```sh
npm start -- run --dry-run-json [taskIds...] [-t <tag>]
```

Output shape:

```json
{
  "root": "/abs/path/to/config/root",
  "executionPlan": [ ["a"], ["b","c"], ["d"] ],
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

### Parse run results

Pass `--junit <path>` to write a [JUnit XML](https://llg.cubic.org/docs/junit/) report on exit. Each task becomes a `<testcase>`; failures carry `<failure>` with the captured stderr inside CDATA; dependency-skipped tasks carry `<skipped>`. Works in both TUI and linear modes; parent directories are created if missing. Exit code is `0` on success, `1` on any failure or skipped-due-to-failed-dep.

```sh
npm start -- run --junit report.xml -t test
```

**GitLab CI** — consumes the file natively via [`artifacts:reports:junit`](https://docs.gitlab.com/ci/yaml/artifacts_reports/#artifactsreportsjunit); results show per-task in the MR widget with failure output inline:

```yaml
test:
  script:
    - npx my-runner run --junit report.xml -t test
  artifacts:
    when: always
    reports:
      junit: report.xml
```

**GitHub Actions** — consume via any of the community JUnit reporters (e.g. [`dorny/test-reporter`](https://github.com/dorny/test-reporter), [`mikepenz/action-junit-report`](https://github.com/mikepenz/action-junit-report)).

The classname attribute is the task's tags joined by `.` (or `task` if untagged), and the name is the task id — so CI UIs that group by classname will bucket tasks under their tag.

### Config schema

`schema.json` at the repo root is a JSON Schema (draft 2020-12) generated from the Zod definition in `src/types/config.ts`. Reference it from any config with `"$schema": "./schema.json"` for validation / autocompletion.

### Exit codes

| Code | Meaning |
|------|---------|
| 0    | All targeted tasks succeeded |
| 1    | One or more tasks failed, or config/validation error |

### Useful commands for introspection

```sh
npm start -- list                   # human-readable task dump
npm start -- validate               # confirms DAG is cycle-free + prints layers
npm start -- run --dry-run-json     # machine-readable plan (see above)
```
