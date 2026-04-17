# Contributing to `@layermix/cli`

Thanks for hacking on Layermix! This doc is for people working **on** the CLI; if you're consuming it, see the [README](./README.md).

## Setup

Requirements:

- Node ≥ 20 (CI runs on 22)
- pnpm 10 (`packageManager` is pinned in `package.json`; Corepack picks it up automatically)

```sh
pnpm install
```

The repo is ESM (`type: "module"`, `NodeNext` resolution). All relative imports inside `src/` use the `.js` extension even though the source is `.ts`/`.tsx` — keep that pattern when adding files.

## Running the CLI from source

The dev entry point is `vite-node` against the TypeScript source — no prebuild step:

```sh
pnpm start                              # bare invocation (idle TUI)
pnpm start -- init                      # scaffold a config in cwd
pnpm start -- list
pnpm start -- validate
pnpm start -- build                     # run a task by id
pnpm start -- -t test                   # run a tag (Layermix's own quality gates — see below)
pnpm start -- run --dry-run-json        # the AI-agent contract
```

The `--` is needed because pnpm forwards everything after it to the underlying script.

## Quality gates (dogfooded)

Layermix runs its own checks via Layermix. The `task-runner.json` at the repo root defines a `test` tag that bundles:

- `lint` — Biome
- `typecheck` — `tsgo` (Microsoft's native TS preview)
- `fallow` — dead-code / dupe / health audit
- `test` — Vitest (unit + e2e)

Run the full suite the same way CI does:

```sh
pnpm start -- -t test
```

You can also invoke individual gates directly:

```sh
pnpm test                # vitest run
pnpm check               # biome check (lint + format)
pnpm check:fix           # auto-fix
pnpm typecheck           # tsgo
pnpm fallow              # dead code / dupes / health
```

To run a single Vitest file or named test:

```sh
pnpm exec vitest run src/core/__tests__/task-graph.test.ts
pnpm exec vitest run -t "cycle detection"
```

## Layout

```
src/
  cli/              CLI entry + Ink TUI
    index.tsx       Commander wiring, mode detection, JUnit collection
    ui/             React/Ink components, keyboard nav, layout
  core/             Pure runner pieces
    config-loader.ts   cosmiconfig + upward-merge
    task-graph.ts      DAG validation, transitive closures, layered toposort
    task-runner.ts     execa wrapper for one task (status, output buffers)
    executor.ts        EventEmitter; schedules + retries the whole DAG
    junit-report.ts    JUnit XML serializer
    __tests__/         unit tests (Vitest)
  types/
    config.ts       zod ConfigSchema → JSON Schema
test/
  e2e.test.ts       spawns the CLI via vite-node against fixtures
  fixtures/         per-test task-runner.json files
scripts/
  generate-schema.ts  emits schema.json from the zod source of truth
```

The deeper architecture (event contracts, scheduling, gotchas) lives in [CLAUDE.md](./CLAUDE.md) — read it before making non-trivial changes to `executor.ts` or `task-runner.ts`.

## Build

```sh
pnpm build                  # tsc → dist/, then chmod +x the bin
pnpm generate-schema        # regenerate schema.json from the zod source
```

`pnpm build` runs `tsc --noCheck` because typechecking is gated separately by `pnpm typecheck` (which uses `tsgo` for speed). Both must pass before publishing.

`prepublishOnly` runs `generate-schema` + `build` automatically, so a clean `pnpm publish` always ships current dist + schema.

## Releasing

We use [Changesets](https://github.com/changesets/changesets). Workflow:

1. Make your change on a branch.
2. `pnpm changeset` — pick the bump (patch / minor / major) and write a one-line summary. This creates a markdown file in `.changeset/`.
3. Commit the changeset alongside your code.
4. Open a PR against `main`. CI runs `pnpm start -- -t test`.
5. After merge, the **Release** workflow opens (or updates) a "Version Packages" PR that consumes the pending changesets and bumps `package.json` + `CHANGELOG.md`.
6. Merging that PR triggers `pnpm release`, which runs `prepublishOnly` (schema + build) and publishes to npm.

Required GitHub secret: `NPM_TOKEN` (an npm automation token with publish access to the `@layermix` scope). The default `GITHUB_TOKEN` covers the PR creation.

To do a one-off manual publish (only if the automation is broken):

```sh
pnpm changeset version       # bumps version + CHANGELOG
pnpm release                 # runs prepublishOnly then changeset publish
```

## Conventions

- **Imports**: ESM with `.js` extensions (see Setup).
- **Lint/format**: Biome — config in `biome.json`. Don't hand-format; run `pnpm check:fix`.
- **Comments**: avoid them unless they explain a non-obvious *why*. The CLAUDE.md and inline comments reflect this.
- **Tests**: prefer fast unit tests in `src/core/__tests__/`; add an e2e test only when the contract is observable from the CLI surface.
- **Zod 4.3.5 quirk**: use `z.object({}).catchall(...)` instead of `z.record` — see comment in `src/types/config.ts`.
- **`dist/`**: committed but stale; the runtime is `vite-node` on `src/`. Don't hand-edit `dist/` — it's only for `npm publish`.
