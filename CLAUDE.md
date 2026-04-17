# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@layermix/cli` — DAG-based task runner CLI (binary: `layermix`). TypeScript + Node (ESM, `NodeNext`). Configured via `task-runner.json` (zod-validated). Runs via Ink TUI in a TTY, linear buffered output otherwise. Project is scaffolded per `INSTRUCTIONS-1.md` → `INSTRUCTIONS-5.md` (treat those as spec).

## Commands

Package manager: **pnpm**. Entry runs via `vite-node` (no prebuild).

- Install: `pnpm install`
- Run CLI: `npm start -- [args]` (e.g. `npm start`, `npm start -- build --ci`, `npm start -- -t test --dry-run-json`, `npm start -- list`, `npm start -- init`). `run` is the default subcommand, so the `run` keyword can be omitted. Bare `npm start` with no task ids or `-t <tag>` is a no-op in *every* mode — TUI opens idle, linear mode (including `--ci` / `--ai` / CI-detected) prints a hint and exits 0. Set `defaultRun` in `task-runner.json` to give an empty invocation a target; otherwise nothing runs. The previous behavior — CI/AI mode auto-running everything on empty target — was removed because `layermix --ai` in an unfamiliar repo would silently execute the entire pipeline.
- Tests (all): `npm test` — includes unit tests in `src/core/__tests__/` and E2E in `test/e2e.test.ts`.
- Tests (single file): `npx vitest run src/core/__tests__/task-graph.test.ts`
- Tests (one test name): `npx vitest run -t "cycle detection"`
- Generate JSON schema: `npm run generate-schema` (writes `schema.json` at repo root). Zod v4 is used — the script calls `z.toJSONSchema(ConfigSchema)` natively; the old `zod-to-json-schema` package emits empty schemas against v4, don't revert to it.

No `build`, `lint`, or `typecheck` script in `package.json`. `tsc` only via the sample `task-runner.json` tasks — not for compiling the CLI itself. `dist/` in git is stale output, not the runtime path.

CLI subcommands (see `src/cli/index.tsx`): `list`, `validate`, `init`, `run [taskIds...]` (default — `layermix [args]` is the same as `layermix run [args]`). `run` flags: `-t <tag>`, `--dry-run-json`, `--concurrency <n>`, `--output-only-failed`, `--ci`, `--ai`, `--junit <path>`. `init` also accepts `--force` to overwrite an existing `task-runner.json`. The previous `interactive` (checkbox selection) command was removed; there is no checkbox UI anymore — pass task ids or `-t <tag>` directly. The old `--no-tui` flag was removed — `--ci` / `--ai` are the ways to force linear mode.

## Architecture

Layers, outside-in:

1. **Config** (`src/types/config.ts`, `src/core/config-loader.ts`)
   - `ConfigSchema` (zod) → `Task { id, cmd, dependsOn, tags, cwd?, env? }`. Note `z.object({}).catchall(z.string())` used instead of `z.record` — known zod 4.3.5 workaround, keep it.
   - `ConfigLoader` uses `cosmiconfig` but **walks upward through parent dirs itself**, collecting every matching config, then `mergeConfigs` applies closer-wins for tasks/env (monorepo semantics). Don't replace with plain `cosmiconfig.search()` — that only finds the nearest one.
   - `NormalizedConfig.tasks` is always a `Record<string, Task>` keyed by id; `normalize()` accepts array or object form.

2. **Graph** (`src/core/task-graph.ts`)
   - Edge direction: `dependency -> task`. Means `graph.adjacent(x)` returns *dependents* of `x`, and nodes with no incoming edges are ready-to-run. Keep this convention — `getAllDependents` and `getExecutionLayers` both rely on it.
   - Validation in constructor: missing dep → throw, cycle (`hasCycle`) → throw.
   - `getAllDependencies` / `getAllDependents` are recursive transitive closures used by `Executor.identifyTasks` (upstream closure) and `Executor.retry` (downstream reset).

3. **Runner** (`src/core/task-runner.ts`)
   - Wraps one `execa` child (`shell: true`, per-task `cwd`, merged env). Buffers stdout/stderr separately into string arrays, emits `output` events per chunk, tracks `IDLE | QUEUED | RUNNING | SUCCESS | FAILURE | SKIPPED` plus start/end timestamps. `reset()` kills the process if still alive — safe to call on retry. `kill()` sends SIGTERM (with a 2s `forceKillAfterTimeout` fallback) and appends a `"--- killed by user ---"` marker to stderr so the reason is visible in logs; the awaiting `execute()` rejects via the normal execa path, which the executor surfaces as `taskFail` — downstream dependents cascade-skip the same way they do for any other failure.

4. **Executor** (`src/core/executor.ts`) — `EventEmitter`
   - **Events** (the API the UI and linear output both consume): `taskAdded(id)`, `taskStart(id)`, `taskSuccess(id, output)`, `taskFail(id, err, output)`, `taskSkipped(id)`, `taskOutput(id, data)`, `taskReset(id)`, `retry(id)`. Any new UI surface should subscribe here, not poke `TaskRunner` directly. `killTask(id)` is the public kill API — it delegates to `TaskRunner.kill()` and returns false if the task isn't currently running; no dedicated `taskKilled` event, since kill is surfaced via the normal `taskFail` path.
   - `identifyTasks(ids?, tag?)` computes the transitive upstream closure — used by the scheduler to add tasks + their deps.
   - **Scheduling is additive.** `scheduleRun(ids?, tag?)` is the primary entry: it creates missing `TaskRunner`s (emitting `taskAdded`), resets failed/skipped tasks, pushes into `pending`, and starts `processQueue()`. It does **not** wipe existing state — already-`completed`/`running` tasks stay untouched, so the TUI can call it repeatedly as the user presses Enter on tags/tasks. `execute()` is a thin wrapper that calls `scheduleRun` then awaits the current `processQueuePromise` — use it when you need a boolean success result; use `scheduleRun` when you just want to enqueue more work.
   - `processQueue()` is a single re-entrant loop: scan `pending` → mark `anyDepFailed` as skipped (cascading) → schedule ready tasks up to `concurrency` (default = `os.cpus().length`) → `Promise.race` running set → repeat. `retry(id)` resets a task + all downstream dependents (via `getAllDependents`), re-adds them to `pending`, then calls `processQueue()` again. The `isProcessing` / `processQueuePromise` guard prevents two loops running in parallel when retry/scheduleRun fires while draining.
   - `getDryRunJson` builds execution layers *over the target subset only*, independent of `TaskGraph.getExecutionLayers` (which operates on the whole graph). Don't unify them unless you also fix the subset-filtering semantics. The payload also includes resolved `cwd` (absolute), merged `env` (global + task-local, no `process.env`), and the full transitive `dependencies` closure per task — this is the AI-friendly contract, keep it stable.
   - CI / AI-agent detection: `ciMode` is true when any of these match — `is-ci` detects a CI env (checks `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, etc.); `--ci` flag is set; `isAiAgent()` detects a coding-agent env (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `CURSOR_TRACE_ID`, `AIDER_MODEL`, `AIDER_CHAT_HISTORY_FILE`, `CONTINUE_SESSION_ID`, or the generic opt-in `AI_AGENT`); or `--ai` flag is set. `--ai` is just an alias for `--ci` — both force linear mode. `useTui = isTTY && !ciMode`. Exit is still 1 on failure. Bare `run` with no task ids or tag is a no-op in *every* mode: TUI stays idle, linear (including CI/AI) prints a hint and exits 0. The previous "CI/AI mode auto-runs all tasks on empty target" behavior was removed — running `layermix --ai` in an unfamiliar repo used to silently execute the whole pipeline, which is too easy to trigger by accident. `defaultRun` is the only way to give an empty invocation a target; it kicks in equally in CI/AI and piped-non-CI linear modes (just not in TUI, which stays idle to preserve the explicit "pick what to run" UX).
   - Machine-readable results go through `--junit <path>` (see `src/core/junit-report.ts`): the CLI subscribes to executor events in *both* TUI and linear modes, accumulates per-task status/duration/output into a `results` Map, and flushes `buildJUnitXml(...)` to the given path right before `process.exit`. The old stdout `---BEGIN MY-RUNNER-REPORT---` / `---END` JSON markers were removed — do not reintroduce them. If you need a different CI report format, add it alongside (`--codequality <path>`, etc.) rather than reviving stdout-marker contracts.

5. **CLI + TUI** (`src/cli/index.tsx`, `src/cli/ui/*`)
   - TTY detection in `run`: `process.stdout.isTTY && options.tui !== false` → Ink; else linear buffered mode. Linear mode subscribes to the same executor events and prints per-task after completion — that's how "output stays ordered" despite parallel execution.
   - Ink tree: `App.tsx` owns nav state. The sidebar is three stacked sections: **Overview** row → `TaskList` (every task in the config, not just the initial target set) → `TagList` (unique tags). Up/Down cycles through all of them. Pressing **Enter** on a task calls `executor.scheduleRun([id])`; on a tag calls `executor.scheduleRun(undefined, name)`. Content area switches between `Overview`, `TaskDetail`, and `TagDetail` based on the selection `kind`.
   - `useTaskExecutor` (`src/cli/ui/useTaskState.ts`) is the **single bridge** from executor events → React state. All per-task status, timing, and output lines live in this hook's `tasks` record — nothing else should subscribe to executor events from inside components. The hook listens to `taskAdded` so tasks added mid-session (via `scheduleRun` of a previously-unscheduled id) appear in state without re-mounting.
   - `App.tsx` currently calls `process.exit(0)` after `waitUntilExit()` — be careful adding post-run logic there; the process dies immediately.

6. **Schema gen** (`scripts/generate-schema.ts`) — calls `z.toJSONSchema(ConfigSchema)` (zod v4 native) and writes `schema.json`. `init` scaffolds a `task-runner.json` with `$schema` pointing to the versioned schema on Unpkg. `ConfigSchema` now declares `$schema` as a known optional field so validation doesn't strip it.

7. **E2E tests** (`test/e2e.test.ts`, fixtures in `test/fixtures/*/task-runner.json`) spawn the CLI via `node <local-vite-node>/dist/cli.mjs --root <repo> src/cli/index.tsx ...`. The `--root` flag is **required** — without it Vite uses the fixture directory as its root and fails to resolve `react/jsx-dev-runtime`. Don't switch to `npx vite-node` — it installs a fresh rolldown binary that's broken on macOS arm64.

## Verification Step

When you finish making the changes run `pnpm start -t test` to run all the checks we have in this project

## Gotchas

- ESM only. Relative imports in `src/**` **must** include `.js` extension (`NodeNext` resolution) even though the source is `.ts`/`.tsx` — this is already the pattern throughout, keep it when adding files.
- Tests mock `execa` directly (see `src/core/__tests__/executor.test.ts`) — when adding executor tests, mirror that mock shape (promise with `.stdout` / `.stderr` objects carrying `on`) or tests will hang on stream listeners.
- `dist/` is committed but stale; runtime is `vite-node` on `src/`. Don't edit `dist/` files — regenerate if actually needed.
- `GEMINI.md` exists with partial/older notes; this file supersedes it for Claude.
- Zod 4.3.5 `z.record` bug — use `z.object({}).catchall(...)`. Don't "fix" it without verifying the zod version.
