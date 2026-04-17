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
    { "id": "clean",   "cmd": "rm -rf dist",   "dependsOn": [],                  "group": "build" },
    { "id": "compile", "cmd": "tsc",           "dependsOn": ["clean"],           "group": "build" },
    { "id": "bundle",  "cmd": "esbuild …",     "dependsOn": ["compile"],         "group": "build" },
    { "id": "lint",    "cmd": "eslint .",      "dependsOn": [],                  "tags": ["test"] },
    { "id": "test",    "cmd": "vitest run",    "dependsOn": ["compile", "lint"], "tags": ["test"] }
  ],
  "env": { "NODE_ENV": "development" },
  "tags":   { "test":  "Quality gates run in CI" },
  "groups": { "build": "Produce a distributable" }
}
```

Per-task fields:

- `id` (required) — unique name. Can contain any characters, including emoji.
- `cmd` (required) — shell command to run.
- `dependsOn` — task ids this task waits for.
- `tags` — string array. Tags have both **UI** and **CLI** semantics: `layermix -t test` runs every task carrying that tag (plus their deps).
- `group` — single string. Groups are **UI-only** — they reorganise the TUI sidebar, but have no CLI surface. See [Tags vs Groups](#tags-vs-groups).
- `description` — optional short blurb, shown in `list` output and in the TUI task header.
- `cwd`, `env` — optional overrides. Task `env` merges on top of global `env`.

Top-level fields:

- `env` — global environment applied to every task.
- `tags` — optional `name → description` map. Annotates tag names shown in `list` output and in TUI headers. Tag membership still lives on each task via the task's `tags` array.
- `groups` — same shape for group names.

Configs are discovered via [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig) and **merged upward** through parent directories: a nearer config overrides tasks of the same id in an outer config (useful in monorepos). `$schema: "./schema.json"` enables IDE autocompletion — the schema is shipped with the package; `layermix init` copies it into your project.

### Tags vs Groups

| | **Tags** | **Groups** |
|---|---|---|
| Purpose | Organise tasks by *role* (what they do) | Organise tasks by *category* (where they live in the UI) |
| Membership | Array — a task can have many | Single string — one group per task |
| CLI | `layermix -t <tag>` runs the tag | No CLI surface — UI-only |
| TUI — main Tasks list | Tagged tasks still appear in the flat list | **Grouped tasks are hidden** from the flat list |
| TUI — collapsibles | Each tag shows as a collapsible row below the Tasks list | Each group shows as a collapsible row *inside* the Tasks list |
| Actions | Run-tag, retry-failed-in-tag, scoped Overview | Scoped Overview (no run/retry; expand and drive tasks individually) |

**Rule of thumb:** If you want to say "run all X tasks from CI", use a tag. If you just want "clean up my sidebar because I have 40 tasks", use a group.

---

## Modes

### TUI (interactive)

When stdout is a TTY, `layermix` launches an Ink TUI. Layout:

```
┌─ Top bar: keyboard hints
│
├─ Overview row
│
├─ Tasks               ← ungrouped tasks (flat)
│   ▸ build            ← collapsible group (Space to expand)
│   ▾ deploy           ← expanded group
│     │ migrate
│     │ push
│
├─ Tags
│   ▸ #test            ← collapsible tag (Space to expand)
│
└─ (right pane: Overview / TaskDetail / TagDetail / GroupOverview)
```

#### Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `↑` / `↓` / `k` / `j` | Sidebar | Move selection |
| `Enter` | Task row | Open task detail |
| `Enter` | Tag row | Open tag detail (Run / Retry Failed) |
| `Enter` | Group row | Show scoped overview |
| `Space` | Group or Tag row | Toggle expand / collapse |
| `/` | Anywhere | Start task-id search |
| `Esc` | Search mode | Cancel search |
| `q` / `Ctrl+C` | Anywhere | Quit |
| `r` | Task detail | Run (ignores deps) — manual override |
| `r` | Tag detail | Run Tag (re-runs even if completed) |
| `R` | Task detail | Run With Deps (re-runs the task + any completed upstream) |
| `F` | Tag detail | Retry Failed (scoped to this tag's failed tasks + downstream) |
| `K` | Task detail, running | Kill the task (fails it, cascades skip downstream) |
| `c` | Task detail | Copy logs to clipboard |
| `x` | Any detail | Close detail view |
| `f` | Task detail | Toggle log fullscreen |
| `PgUp` / `PgDn`, `Ctrl+u/d`, `Ctrl+b/f` | Task detail | Scroll logs |
| `g` / `G` | Task detail | Jump to top / tail |

#### Status icons

| Icon | Colour | State |
|:-:|---|---|
| `○` | yellow | **Waiting** — not yet queued |
| `●` | blue | **Queued** — scheduled, waiting for a concurrency slot or upstream deps |
| `spinner` | blue | **Running** |
| `✓` | green | **Success** |
| `✗` | red | **Failure** |
| `-` | gray | **Not started** — upstream dep failed, so this cascade-skipped |

Rapid-fire pressing Run on multiple tasks? They stack up as blue `●` so you can see what's queued behind the currently running ones.

#### Search

Press `/` and type any substring of a task id. Matches filter the Tasks list as you type; non-matching groups and tags stay visible but collapse-by-default. If your query matches tasks *inside* a collapsed group or tag, that collapsible auto-expands so you can see the hit. Shortcuts like `r` / `R` / `F` are disabled while you're typing a query — every keystroke feeds the query instead.

#### Re-running

Re-run semantics depend on which "Run" action you hit:

- **Task detail → Run (`r`)** — fires just this one task, ignores whether upstream deps are up to date. Useful for power users who know inputs haven't changed.
- **Task detail → Run With Deps (`R`)** — re-runs this task *and* re-runs any already-completed upstream deps from the top. Useful when you want a fresh build from scratch.
- **Tag detail → Run Tag (`r`)** — re-runs every task carrying the tag, even if they already succeeded. Upstream deps **outside** the tag stay cached.
- **Tag detail → Retry Failed (`F`)** — only resets tasks in this tag that are currently in `FAILURE`, plus their downstream dependents. Skips tasks that succeeded. Great for "iterate on the lint failures without re-running tests".

The retry helper also resets tasks downstream of a failure, so re-running isn't just optimistic — anything that was cascade-skipped because of the failure gets a fresh shot too.

### Linear (CI / agents)

`--ci`, `--ai`, or any non-TTY stdout: output is **buffered per task** and flushed only after a task finishes — so parallel execution doesn't garble logs. Task headers (`[task] Starting...` / `Finished (Success)` / `Failed` / `Skipped`) mark ordering.

CI mode is auto-detected via [`is-ci`](https://www.npmjs.com/package/is-ci) (common CI env vars: `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, etc.) or via the explicit `--ci` flag. AI-agent mode is detected from coding-agent env vars (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `CURSOR_TRACE_ID`, `AIDER_MODEL`, `AIDER_CHAT_HISTORY_FILE`, `CONTINUE_SESSION_ID`) or the explicit `--ai` flag; the generic `AI_AGENT` env var is a manual opt-in for anything unlisted.

In CI/AI mode, an empty target runs **all** tasks. In normal mode, an empty target runs nothing — pass task ids or `-t <tag>`.

---

## Scenarios

**"Run CI's test suite locally."**
`layermix -t test` — runs everything tagged `test` plus transitive deps.

**"My monorepo's task list is 40 entries long; I can't find anything."**
Add `group: "build"` / `"deploy"` / `"db"` to related tasks. The main Tasks list shrinks to the essentials; the rest live under collapsible headers. Or hit `/` to fuzzy-jump.

**"One lint failure is blocking CI; iterate fast."**
In the TUI: navigate to `#test`, press `Enter`, `F` (Retry Failed). Only the red tasks reset; the successes stay cached.

**"I want a fresh build from scratch."**
Select the build leaf task, press `R` (Run With Deps). Everything upstream resets and re-runs, even previously-green tasks.

**"Pipeline hung on task X."**
Select X in the task detail, press `K`. It's killed (SIGTERM, then SIGKILL after 2s), surfaces as a failure, and everything downstream cascade-skips.

**"What will CI actually do?"**
`layermix run --dry-run-json -t test` prints the full execution plan as JSON — layered topological sort, resolved env, absolute cwds.

**"Wire it into GitLab / GitHub Actions."**
`layermix -t test --junit report.xml` — see [JUnit report](#junit-report) below.

**"I'm running from Claude Code / Cursor."**
Nothing to do — auto-detected via env vars. Output drops to linear, and an empty target auto-runs everything, so the agent sees a clean machine-readable stream without any flags.

---

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
