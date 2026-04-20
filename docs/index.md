`layermix` reads a `task-runner.json` with tasks and their dependencies, builds the DAG, and runs tasks in parallel up to the graph's constraints. The same config drives three runtime modes.

In a terminal, it launches an interactive [Ink](https://github.com/vadimdemedes/ink) TUI. You watch status change live, retry failed tasks with a keystroke, and filter by typing `/`.

![layermix TUI](./tui-preview.png)

In CI, output is buffered per task and flushed on completion. Each task gets a `[task] Starting...` / `Finished` / `Failed` header block, so parallel execution never interleaves. Pass `--junit <path>` for a machine-readable report.

Inside Claude Code, Cursor, Aider, or Continue, the agent is auto-detected via env vars. Output drops to linear, no flags needed. `--dry-run-json` gives the agent the full execution plan (layered topological sort, resolved cwd and env, transitive dep closure) without spawning processes.

The same invocation works everywhere. `layermix -t test` means the same thing on your laptop, in GitHub Actions, and when Claude Code runs it.

## Install

```sh
npm i -g @layermix/cli
# or ad-hoc
npx @layermix/cli init
```

Node 20+. Binary: `layermix`.

## 60-second tour

Scaffold a config:

```sh
layermix init
```

Replace the placeholder with your real tasks:

```json
{
  "$schema": "https://unpkg.com/@layermix/cli@2.3.0/schema.json",
  "tasks": [
    { "id": "clean",   "cmd": "rm -rf dist",   "dependsOn": [] },
    { "id": "compile", "cmd": "tsc",           "dependsOn": ["clean"] },
    { "id": "lint",    "cmd": "biome check .", "dependsOn": [],          "tags": ["test"] },
    { "id": "test",    "cmd": "vitest run",    "dependsOn": ["compile"], "tags": ["test"] }
  ]
}
```

Run tasks by id. Dependencies fire automatically:

```sh
layermix compile                        # clean, then compile
layermix lint test                      # both, with max parallelism
```

Run every task carrying a tag:

```sh
layermix -t test
```

Inspect the plan without touching anything:

```sh
layermix validate                       # prints execution layers
layermix run --dry-run-json -t test     # prints JSON with layers, cwd, env, deps
```

Drop it in CI:

```sh
layermix -t test --ci --junit report.xml
```

That's the whole idea. The rest of the docs cover the config surface, the TUI, CI and agent behaviour, and the weirder bits.

## Why I built this

I kept writing the same shell glue in every project: "clean, then `tsc`, then in parallel run lint and test". `make` works for DAGs but fights modern shell escapes. `turborepo` and `nx` are heavier than I want for a small TypeScript project. `npm-run-all` does parallel but not dependencies.

`layermix` is one JSON file and a runner that works the same on my laptop, in CI, and inside a coding agent. A few opinionated choices worth flagging:

- A bare `layermix` with no target does nothing on purpose. In CI/AI mode it exits 1, so a scheduled agent can't silently succeed. In a terminal it opens the TUI idle. Set `defaultRun` to give empty invocations a target.
- Unknown task ids and tags exit 1 in every mode. `layermix tst` (typo for `test`) fails loudly instead of quietly succeeding.
- Linear output is boring on purpose: `[task] Starting...` / `Finished` / `Failed` / `Skipped` headers, logs between them. Grep-friendly.
- There's no plugin system. If you need to do something, write a task that does it.

## Where next

- [`task-runner.json` reference](./config.md). Every field. Monorepo merge semantics. `defaultRun`. Tags vs groups.
- [Terminal UI guide](./tui.md). Layout, keybindings, search, the seven run / retry actions.
- [CI and AI agents](./ci-and-agents.md). `--ci`, `--ai`, auto-detection, JUnit, dry-run JSON, agent skill file.
- [Task arguments](./task-arguments.md). Parameterised tasks: `$1`, `$2`, file pickers in the TUI, `--arg` on the CLI.
- [Scenarios](./scenarios.md). Task-oriented playbook. "I want to X" to "run this".
- [CLI reference](./cli-reference.md). Every subcommand, flag, exit code.

Source is on [GitHub](https://github.com/layermix-labs/cli). Issues and PRs welcome.
