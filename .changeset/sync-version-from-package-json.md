---
"@layermix/cli": patch
---

fix(cli): read version from package.json so `--version` and scaffolded `$schema` stay in sync

Two spots hardcoded the version string (`2.2.0`) and drifted from `package.json` (`2.3.0`): `program.version(...)` in Commander, and the `$schema` URL in the `init` scaffold. Both now read from `package.json` at startup, so future `pnpm changeset version` bumps don't leave stale strings behind.

No behavioural change for existing configs. Newly scaffolded `task-runner.json` files will point at the installed CLI's version of the schema on Unpkg.
