---
title: Scenarios
---

# Scenarios

[Home](./index.md)

Task-oriented playbook. Find what you want to do, grab the command.

## Run CI's test suite locally

```sh
layermix -t test
```

Runs every task tagged `test`, plus transitive upstream deps.

## A monorepo with 40 tasks is hard to navigate

Add `group: "build"` / `"deploy"` / `"db"` to related tasks. The main Tasks list shrinks to the essentials. The rest live under collapsible headers. Or press `/` in the TUI and type any substring of the id or label.

## One lint failure is blocking CI, iterate fast

In the TUI: navigate to `#test`, press Enter, then `F` (Retry Failed). Only the red tasks reset. The successful ones stay cached, so you don't wait for a long test suite to re-run.

## Fresh build from scratch

Select the build leaf task. Press `R` (Run With Deps). Everything upstream resets and re-runs, even previously-green tasks.

## Pipeline hung on task X

Select X in the task detail, press `K`. It's killed (SIGTERM, then SIGKILL after 2s). It surfaces as a failure, and everything downstream cascade-skips.

## What will CI actually do?

```sh
layermix run --dry-run-json -t test
```

Prints the execution plan as JSON. Layered topological sort, resolved env, absolute cwds, full transitive dep closure. No processes spawned.

## Wire it into GitHub Actions or GitLab CI

```sh
layermix -t test --junit report.xml
```

Writes a JUnit XML report. Consumed natively by GitLab's `artifacts:reports:junit`, or by GitHub Actions community reporters like `dorny/test-reporter`. See [CI and AI agents](./ci-and-agents.md#junit-report) for the full details.

## Parameterise a command I keep typing

If you keep typing `vitest run path/to/foo.test.ts -t 'some name'`, make it a one-keystroke task:

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

From the TUI, Enter on the task opens a file picker scoped to your test glob, then a name-pattern prompt. After the first run, Rerun replays the same selection until you change it. From the CLI: `layermix test-file -a path/to/foo.test.ts -a "some name"`.

See [Task arguments](./task-arguments.md) for the full picker types and CLI flag shape.

## CI should run quality gates by default, without the flag

Set `defaultRun` at the top of `task-runner.json`:

```json
"defaultRun": "-t test"
```

Now `layermix --ci` with no explicit target runs the test tag. Explicit targets on the command line still win, so `layermix --ci -t deploy` still runs deploy.

## I'm running from Claude Code or Cursor

Nothing to do. Most coding agents are auto-detected via env vars (see [Detecting CI and agents](./ci-and-agents.md#detecting-ci-and-agents) for the list), and output drops to linear automatically. An empty target in agent mode is a hard error, so if you get `Error: No tasks specified`, either pass a task id / `-t <tag>`, or configure `defaultRun`.

## See also

- [CLI reference](./cli-reference.md)
- [task-runner.json reference](./config.md)
