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
# scaffold a task-runner.json in the current dir
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

A bare `layermix` with no target is a no-op — the TUI opens idle, and piped non-CI linear mode prints a hint and exits 0. **CI/AI mode treats an empty target as a hard error (exit 1)** so a scheduled agent or CI job doesn't silently exit green with nothing done. Set [`defaultRun`](#defaultrun) in `task-runner.json` to give an empty invocation a target, or pass task ids / `-t <tag>` explicitly. Unknown task ids or tags are also a hard error (exit 1) in every mode — silent no-ops used to hide typos.

## Config (`task-runner.json`)

```json
{
  "$schema": "https://unpkg.com/@layermix/cli@2.2.0/schema.json",
  "defaultRun": "-t test",
  "tasks": [
    { "id": "clean",   "cmd": "rm -rf dist",   "dependsOn": [],                  "group": "build" },
    { "id": "compile", "cmd": "tsc",           "dependsOn": ["clean"],           "group": "build", "label": "TypeScript compile" },
    { "id": "lint",    "cmd": "eslint .",      "dependsOn": [],                  "tags": ["test"] },
    { "id": "test",    "cmd": "vitest run",    "dependsOn": ["compile", "lint"], "tags": ["test"] },
    {
      "id": "test-file",
      "cmd": "vitest run $1 -t $2",
      "args": [
        { "type": "file", "label": "Test file", "glob": "**/*.test.ts" },
        { "type": "text", "label": "Test name pattern", "default": "" }
      ]
    }
  ],
  "env": { "NODE_ENV": "development" },
  "tags":   { "test":  "Quality gates run in CI" },
  "groups": { "build": "Produce a distributable" }
}
```

Per-task fields:

- `id` (required) — unique name. Can contain any characters, including emoji. This is the canonical handle: CLI targets (`layermix <id>`), `dependsOn` references, JUnit `testcase` names, and dry-run JSON keys all use the id.
- `cmd` (required) — shell command to run. May reference positional `$1`, `$2`, ... placeholders that get filled in from `args` (see [Task arguments](#task-arguments)).
- `label` — optional display name. When set, used in the TUI sidebar, task detail header, Overview waterfall, `list` output, and linear log prefixes (`[label] Starting...`) in place of `id`. Purely cosmetic — `id` stays the canonical handle everywhere else, so changing a label never breaks `dependsOn` references, CLI invocations, or CI integrations parsing JUnit/dry-run output. Task search (`/` in the TUI) matches on both id and label.
- `dependsOn` — task ids this task waits for.
- `tags` — string array. Tags have both **UI** and **CLI** semantics: `layermix -t test` runs every task carrying that tag (plus their deps).
- `group` — single string. Groups are **UI-only** — they reorganise the TUI sidebar, but have no CLI surface. See [Tags vs Groups](#tags-vs-groups).
- `description` — optional short blurb, shown in `list` output and in the TUI task header.
- `cwd`, `env` — optional overrides. Task `env` merges on top of global `env`.
- `args` — optional positional input declarations. See [Task arguments](#task-arguments).

Top-level fields:

- `env` — global environment applied to every task.
- `tags` — optional `name → description` map. Annotates tag names shown in `list` output and in TUI headers. Tag membership still lives on each task via the task's `tags` array.
- `groups` — same shape for group names.
- `defaultRun` — CLI-style fallback target. See [`defaultRun`](#defaultrun).

Configs are discovered via [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig) and **merged upward** through parent directories: a nearer config overrides tasks of the same id in an outer config (useful in monorepos). `$schema` enables IDE autocompletion — the schema is hosted on GitHub; `layermix init` scaffolds a config with the correct reference.

### Task arguments

A task can declare positional input slots referenced as `$1`, `$2`, ... in its `cmd`. When the task runs, layermix collects each slot's value (TUI prompt, CLI flag, or declared default), shell-quotes it, and substitutes it into the command.

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

Four input types:

| Type | Picker | Useful options |
|------|--------|----------------|
| `text` | Free-form text input | `default` (string) |
| `select` | Pick one from a list | `choices` (string[]), `default` |
| `file` | Glob-filtered file picker | `glob` (defaults to `**/*`), `multiple` (checklist mode) |
| `folder` | Glob-filtered directory picker | `glob`, `multiple` |

`label` is shown in the picker prompt; falls back to `Argument $N` when omitted.

**TUI flow** — pressing Run on a task with declared args opens a modal that walks each input in turn (Enter to advance, Esc to cancel). After submission, the task runs and the sidebar selection auto-jumps to it so the log streams into view. After a successful run, the TaskDetail menu adds a **Rerun** option that replays the same args without re-prompting; after a failure it adds a **Run** option that re-opens the picker so you can change inputs.

**CLI flow** — pass values positionally with `-a` / `--arg` (repeatable, in declared order). Multi-select args take a comma-separated string:

```sh
layermix test-file -a "src/foo.test.ts" -a "cycle detection"
layermix lint-files -a "src/a.ts,src/b.ts"   # multi-select file arg
```

`--arg` rejects multi-task targets (no unambiguous mapping). When a value is omitted, the declared `default` is used (text/select only — file/folder args are required to have a picked value).

`file` / `folder` paths in the picker are resolved against the task's `cwd` (or the config root when `cwd` is unset). Multi-select joins paths with spaces, each shell-quoted independently.

### `defaultRun`

CLI-style fallback target used when no task ids or `-t <tag>` are passed in **non-TUI** modes (CI, AI-agent, piped shells). TUI sessions stay idle so the explicit "pick what to run" UX is preserved.

```json
"defaultRun": "-t test"        // tag selector
"defaultRun": "build"          // single task id
"defaultRun": "build deploy"   // multiple task ids
```

The format mirrors what you'd type after `layermix`. Explicit user targets always win — `defaultRun` only fires when both the positional ids and `-t` are missing. Without `defaultRun`, an empty invocation does nothing (prints a hint, exits 0) — including in CI/AI mode.

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
| `r` | Task detail | Run (ignores deps; opens picker if task has `args`) |
| `r` | Task detail, FAILURE | Retry — replays the last args silently |
| `r` | Tag detail | Run Tag (re-runs even if completed) |
| `R` | Task detail | Run With Deps (re-runs the task + any completed upstream). Hidden when the task has no `dependsOn` |
| `F` | Tag detail | Retry Failed (scoped to this tag's failed tasks + downstream) |
| `K` | Task detail, running | Kill the task (fails it, cascades skip downstream) |
| `c` | Task detail | Copy logs to clipboard |
| `x` | Any detail | Close detail view |
| `f` | Task detail | Toggle log fullscreen |
| `PgUp` / `PgDn`, `Ctrl+u/d`, `Ctrl+b/f` | Task detail | Scroll logs |
| `g` / `G` | Task detail | Jump to top / tail |
| Menu nav (`←` / `→` / `h` / `l` + `Enter`) | Task detail, SUCCESS with `args` | Activate **Rerun** (replay last args) — no shortcut, menu only |
| Menu nav | Task detail, FAILURE with `args` | Activate **Run** to re-pick args |

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

- **Task detail → Run (`r`)** — fires just this one task, ignores whether upstream deps are up to date. Useful for power users who know inputs haven't changed. If the task declares [`args`](#task-arguments), opens the picker first.
- **Task detail → Rerun** (success state, args-aware tasks; menu only) — replays the last collected args without re-prompting. The default-highlighted option after a green run.
- **Task detail → Run With Deps (`R`)** — re-runs this task *and* re-runs any already-completed upstream deps from the top. Useful when you want a fresh build from scratch. Hidden for tasks with no `dependsOn` (would duplicate Run).
- **Task detail → Retry (`r`, failure state)** — replays the last args silently. The fast iteration path after a red run.
- **Task detail → Run** (failure state, args-aware tasks; menu only) — re-opens the picker so you can change inputs that caused the failure.
- **Tag detail → Run Tag (`r`)** — re-runs every task carrying the tag, even if they already succeeded. Upstream deps **outside** the tag stay cached.
- **Tag detail → Retry Failed (`F`)** — only resets tasks in this tag that are currently in `FAILURE`, plus their downstream dependents. Skips tasks that succeeded. Great for "iterate on the lint failures without re-running tests".

The retry helper also resets tasks downstream of a failure, so re-running isn't just optimistic — anything that was cascade-skipped because of the failure gets a fresh shot too.

### Linear (CI / agents)

`--ci`, `--ai`, or any non-TTY stdout: output is **buffered per task** and flushed only after a task finishes — so parallel execution doesn't garble logs. Task headers (`[task] Starting...` / `Finished (Success)` / `Failed` / `Skipped`) mark ordering.

CI mode is auto-detected via [`is-ci`](https://www.npmjs.com/package/is-ci) (common CI env vars: `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, etc.) or via the explicit `--ci` flag. AI-agent mode is detected from coding-agent env vars (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `CURSOR_TRACE_ID`, `AIDER_MODEL`, `AIDER_CHAT_HISTORY_FILE`, `CONTINUE_SESSION_ID`) or the explicit `--ai` flag; the generic `AI_AGENT` env var is a manual opt-in for anything unlisted.

An empty target never auto-runs everything — regardless of mode (TUI, piped shell, `--ci`, `--ai`, CI-detected). If [`defaultRun`](#defaultrun) is set, that target runs in every linear-mode shape (CI/AI, piped non-CI). Without `defaultRun`: in CI/AI mode, the command exits **1** with a stderr error so a scheduled job or agent can't silently succeed; in a piped non-CI shell it prints a yellow hint and exits 0; in the TUI it stays idle so the explicit "pick what to run" UX is preserved. Unknown task ids or tags (whether passed on the CLI or via `defaultRun`) also exit 1 in every mode.

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

**"I keep typing `vitest run path/to/foo.test.ts -t 'some name'` — make it a one-keystroke task."**
Declare an [args-aware task](#task-arguments) — `cmd: "vitest run $1 -t $2"` with a `file` arg + a `text` arg. From the TUI, Enter on the task opens a file picker scoped to your test glob, then a name-pattern prompt. After the first run, **Rerun** replays the same selection until you change it. From the CLI, `layermix test-file -a path/to/foo.test.ts -a "some name"` does the same in one line.

**"CI should just run my quality gates by default — without remembering the flag."**
Set `defaultRun: "-t test"` (or any task id) at the top of `task-runner.json`. CI/AI invocations with no explicit target use it; explicit `layermix -t deploy` from the command line still wins.

**"I'm running from Claude Code / Cursor."**
Nothing to do — auto-detected via env vars. Output drops to linear, so the agent sees a clean machine-readable stream without any flags. An empty target no longer auto-runs the whole pipeline; in CI/AI mode it's a hard error (exit 1) instead of a silent no-op, so a typo or a missing `defaultRun` fails the job loudly. Pass explicit task ids / `-t <tag>`, or configure [`defaultRun`](#defaultrun) so the agent has a target to hit.

---

## CLI reference

```
layermix [run] [taskIds...] [options]   # run is the default subcommand
layermix list                            # human-readable task dump
layermix validate                        # confirms DAG is cycle-free + prints layers
layermix init [--force]                  # scaffold task-runner.json
```

`run` flags:

| Flag | Meaning |
|------|---------|
| `-t, --tag <tag>` | run all tasks carrying this tag (and their deps) |
| `-a, --arg <value>` | positional value for the target task's `args[i]` (repeatable, in order). Comma-separated for multi-select file/folder args. Single-task targets only — see [Task arguments](#task-arguments) |
| `--concurrency <n>` | cap parallelism (defaults to CPU count) |
| `--output-only-failed` | linear mode: only print logs for failed tasks |
| `--ci` | force linear mode. With no explicit target, runs `defaultRun` if set; otherwise exits 1 with an error (no silent no-op in CI) |
| `--ai` | alias for `--ci` |
| `--junit <path>` | write a JUnit XML report on exit |
| `--dry-run-json` | print the execution plan as JSON, run nothing |

### Exit codes

| Code | Meaning |
|------|---------|
| 0    | All targeted tasks succeeded (or, in piped non-CI mode, no target was specified and no `defaultRun` is configured — a soft hint is printed) |
| 1    | One or more tasks failed (or were skipped due to a failed dep), an unknown task id or tag was targeted, config/validation failed, or `--ci`/`--ai` was used with no explicit target and no `defaultRun` |

## For CI / AI agents

### Agent skill template

Projects that consume `@layermix/cli` can drop a pre-written skill file into their repo to teach Claude Code (and other skill-aware coding agents) how to use this tool correctly — which flags are safe, how to read `task-runner.json`, when to prefer `--dry-run-json`, how to interpret failures, etc.

Grab it from [`agent-skill.md`](./agent-skill.md) in this repo and copy it into your project:

```sh
# Claude Code skill location
mkdir -p .claude/skills/layermix
curl -fsSL https://raw.githubusercontent.com/layermix-labs/cli/master/agent-skill.md \
  -o .claude/skills/layermix/SKILL.md
```

The file is a self-contained Markdown doc with YAML frontmatter (`name` + `description`). Agents that follow the Claude Code skill convention will auto-load it when the user mentions building, testing, or running tasks in a repo that has a `task-runner.json`. For other tools, drop it wherever that tool expects agent context (e.g. `AGENTS.md`, `.cursor/rules/`, etc.) or just reference it from your `CLAUDE.md`.

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
