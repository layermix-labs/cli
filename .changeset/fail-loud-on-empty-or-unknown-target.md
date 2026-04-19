---
"@layermix/cli": minor
---

change(cli): fail loudly on empty or unknown targets in CI/AI mode

Two user-input failure modes that used to silently exit 0 now exit 1:

- **Unknown task id / tag** (in every mode, TUI included). `layermix buildd` (typo) previously resolved to an empty task set and exited green; now it prints `Error: Unknown task: "buildd"` to stderr and exits 1. Same for `-t <tag>` when no task carries the tag. Applies to `defaultRun` too — a misconfigured `"defaultRun": "-t teest"` no longer silently no-ops.
- **Empty target in CI/AI mode** (`--ci`, `--ai`, `CLAUDECODE`/`CURSOR_AGENT`/etc., or any `is-ci`-detected env). Previously printed a yellow hint and exited 0 — the same as a piped non-CI shell. That was too quiet for a scheduled agent or CI job: the run would appear green while nothing had been done. Now it prints an error and exits 1.

Piped non-CI linear mode (e.g. `layermix | less` from a dev terminal) is unchanged — it still prints the yellow hint and exits 0, since a human is there to read it. TUI sessions are unchanged: they stay idle on empty target and never fail on construction for a missing id (you navigate and pick).

**Migration:** if your CI pipeline relied on `layermix --ci` being a no-op when nothing was configured, either pass an explicit target (`layermix --ci -t test`) or set `defaultRun` in `task-runner.json`:

```json
"defaultRun": "-t test"
```
