---
"@layermix/cli": minor
---

**`defaultRun` config field.** New top-level option that sets a CLI-style fallback target for non-TUI invocations:

```json
"defaultRun": "-t test"        // tag selector
"defaultRun": "build"          // single task id
"defaultRun": "build deploy"   // multiple task ids
```

Fires in any non-TUI run (`--ci`, `--ai`, auto-detected CI/AI env, or piped non-TTY shells) when no explicit target is supplied. TUI sessions stay idle so the explicit "pick what to run" UX is preserved. Explicit user targets always win over `defaultRun`.

In CI/AI mode, this pre-empts the previous "run everything" fallback — invocations like `layermix --ci` now run only the configured target instead of the full graph. In piped non-CI mode, it pre-empts the "No tasks specified" hint.
