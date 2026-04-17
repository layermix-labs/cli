---
"@layermix/cli": minor
---

change(cli): remove the implicit "run everything" fallback in CI/AI mode

Bare `layermix --ci` (or `--ai`, or any CI-detected invocation) with no explicit target no longer runs every task. It now prints the same `No tasks specified…` hint the piped non-CI path does and exits 0. `layermix --ai` in an unfamiliar repo shouldn't silently execute the whole pipeline.

**Migration:** set `defaultRun` in `task-runner.json` — it kicks in in every linear-mode shape (CI/AI and piped non-CI) and is unchanged:

```json
"defaultRun": "-t test"   // or a task id, or "id1 id2"
```

TUI sessions are unchanged: they still stay idle on an empty target.
