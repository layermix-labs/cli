---
title: task-runner.json reference
---

# task-runner.json reference

[Home](./index.md)

`task-runner.json` is the one file `layermix` reads. It has:

- a `tasks` array (or object keyed by id)
- optional `env`, `tags`, `groups` maps
- an optional `defaultRun` string
- an optional `$schema` pointer, for IDE autocomplete

Minimal example:

```json
{
  "$schema": "https://unpkg.com/@layermix/cli@2.3.0/schema.json",
  "defaultRun": "-t test",
  "tasks": [
    { "id": "lint", "cmd": "biome check .", "dependsOn": [],       "tags": ["test"] },
    { "id": "test", "cmd": "vitest run",    "dependsOn": ["lint"], "tags": ["test"] }
  ],
  "env":  { "NODE_ENV": "development" },
  "tags": { "test": "Quality gates run in CI" }
}
```

## Per-task fields

`id` (required) is the canonical handle. Every other surface (CLI targets, `dependsOn`, JUnit `testcase` names, dry-run JSON keys) uses the id. Any characters work, emoji included.

`cmd` (required) is the shell command. It runs with `execa({ shell: true })` so pipes, glob expansion, and shell builtins all work. It can reference positional placeholders `$1`, `$2`, etc. when the task declares `args` (see [Task arguments](./task-arguments.md)).

`label` is an optional display name. When set, the TUI sidebar, task detail header, `list` output, and linear log prefixes use it instead of `id`. Changing a label never breaks `dependsOn`, CLI invocations, or JUnit output (those stay keyed on `id`). Task search (`/` in the TUI) matches both id and label.

`dependsOn` is a list of task ids this task waits for. Transitive deps are computed automatically: running a task also runs everything upstream of it.

`tags` is a string array. Tags have both UI and CLI meaning: `layermix -t test` runs every task with `test` in its `tags`, plus transitive deps.

`group` is a single string. Groups are UI-only: they collapse related tasks in the TUI sidebar but have no CLI surface. See [Tags vs groups](#tags-vs-groups).

`description` is an optional short blurb shown in `list` output and in the TUI task header.

`cwd` and `env` are per-task overrides. Task `env` merges on top of global `env`, which in turn merges on top of `process.env` at spawn time.

`args` is an optional array of positional input declarations. See [Task arguments](./task-arguments.md).

## Top-level fields

`env` is the global environment, applied to every task. Task-local `env` wins on conflict.

`tags` is a `name` to `description` map that annotates tag names shown in `list` output and the TUI. Tag membership still lives on each task via the task's `tags` array. The top-level `tags` map is just a description catalogue.

`groups` is the same shape, for group names.

`defaultRun` is a CLI-style fallback target used when no explicit target is passed in non-TUI modes. Format mirrors what you'd type after `layermix`:

```json
"defaultRun": "-t test"        // tag selector
"defaultRun": "build"          // single task id
"defaultRun": "build deploy"   // multiple task ids
```

Explicit CLI targets always win. Without `defaultRun`, an empty invocation in CI/AI mode exits 1. See [CI and AI agents](./ci-and-agents.md#empty-target-behaviour).

`$schema` points to the versioned JSON schema on [unpkg](https://unpkg.com). `layermix init` scaffolds this for you. VS Code and JetBrains IDEs use it for completion and validation out of the box.

## Config discovery

Configs are discovered via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) under the `task-runner` name. Any of these work:

- `task-runner.json`
- `task-runner.yaml` / `.yml`
- `task-runner.js` / `.cjs` / `.mjs`
- `.task-runnerrc*`
- a `taskRunner` field in `package.json`

The loader walks upward through parent directories from `process.cwd()` and merges every config it finds. A closer config wins per task id. Useful in monorepos: a package-local `task-runner.json` can override one task from the root config while inheriting the rest.

Merge semantics:

- `tasks` merge by id. Closer wins.
- `env` merges by key. Closer wins.
- `tags` and `groups` maps merge by key. Closer wins.
- `defaultRun` uses the closest-defined value.

## Tags vs groups

Both organise tasks. They do different things.

| | Tags | Groups |
|---|---|---|
| What they're for | Role: what the task does | Category: where it lives in the UI |
| Membership | Array. A task can have many tags. | Single string. One group per task. |
| CLI surface | `layermix -t <tag>` runs the tag. | None. |
| TUI main list | Tagged tasks still show in the flat Tasks list. | Grouped tasks are hidden from the flat list, shown only inside the group. |
| Actions | Run tag, retry-failed-in-tag, scoped Overview. | Scoped Overview only. Tasks are driven individually. |

Rule of thumb: tag by function ("things that run in CI"), group by location ("build-related tasks"). If you want to run a set from the command line, tag it. If you just want to tidy the sidebar, group it.

## See also

- [Task arguments](./task-arguments.md)
- [CLI reference](./cli-reference.md)
- [CI and AI agents](./ci-and-agents.md)
