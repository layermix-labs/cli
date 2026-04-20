---
title: CI and AI agents
---

# CI and AI agents

[Home](./index.md)

Linear mode activates whenever stdout isn't a TTY, or when you pass `--ci` / `--ai`, or when `layermix` auto-detects a CI runner or a coding agent. Output is buffered per task and flushed after each one finishes, so parallel execution never interleaves logs.

## How linear output looks

```
[lint] Starting...
[compile] Starting...
[compile] Finished (Success)
--- Output for compile ---
...
-------------------------
[lint] Finished (Success)
--- Output for lint ---
...
-------------------------
[test] Starting...
[test] Finished (Success)
```

Per-task headers are `[task] Starting...` / `Finished (Success)` / `Failed` / `Not Started (dependency failed)`. The `[task]` prefix uses `label` when set and `id` otherwise. Pass `--output-only-failed` to suppress logs for green tasks.

## Detecting CI and agents

CI mode turns on if any of these match:

- [`is-ci`](https://www.npmjs.com/package/is-ci) detects a CI environment. It checks `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, and a long list of runner-specific vars (`GITLAB_CI`, `CIRCLECI`, `BUILDKITE`, `JENKINS_URL`, etc.).
- You pass `--ci` explicitly.
- You pass `--ai`, which is an alias for `--ci`.

AI-agent mode is detected via these env vars:

- `CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT` (Claude Code)
- `CURSOR_AGENT` or `CURSOR_TRACE_ID` (Cursor)
- `AIDER_MODEL` or `AIDER_CHAT_HISTORY_FILE` (Aider)
- `CONTINUE_SESSION_ID` (Continue)
- `AI_AGENT` (generic opt-in for anything unlisted)

If any of those are set, `layermix` behaves like `--ai` was passed. No flag needed from the agent side.

## Empty target behaviour

A bare `layermix` with no task ids, no `-t`, and no `defaultRun`:

- In the TUI: opens idle. Nothing runs until you pick something.
- In a piped non-CI shell (e.g. `layermix | less`): prints a yellow hint on stdout, exits 0.
- In CI/AI mode: exits 1 with an error on stderr.

The CI/AI case is a hard error on purpose. A scheduled agent running `layermix --ai` in an unfamiliar repo used to execute the entire pipeline. That silent run-everything was removed, and the follow-up removed the soft "exit 0 with a hint" for CI/AI too. If a CI job or agent gets here with no target, it probably meant to hit one, and exiting green would hide the miss.

If you set `defaultRun` in `task-runner.json`, it kicks in for empty invocations in every non-TUI mode. Explicit CLI targets still win.

Unknown task ids or tags also exit 1 in every mode. `layermix tst` (typo) fails with `Error: Unknown task: "tst"` instead of succeeding silently.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Every targeted task succeeded. Or (piped non-CI only) no target was specified and no `defaultRun` is configured: a hint is printed. |
| 1 | A task failed, or cascade-skipped because of a failed dep. Or an unknown task id / tag was targeted. Or config / validation failed. Or `--ci` / `--ai` was used with no explicit target and no `defaultRun`. |

Rely on the exit code. Don't parse stdout.

## Dry-run JSON

Before running anything unfamiliar, ask for the plan:

```sh
layermix run --dry-run-json [taskIds...] [-t <tag>]
```

The payload:

```json
{
  "root": "/abs/path/to/config/root",
  "executionPlan": [["clean"], ["compile", "lint"], ["test"]],
  "tasks": {
    "compile": {
      "id": "compile",
      "cmd": "tsc",
      "cwd": "/abs/path",
      "env": { "NODE_ENV": "development" },
      "dependsOn": ["clean"],
      "dependencies": ["clean"],
      "tags": []
    }
  }
}
```

`executionPlan` is a layered topological sort over the target subset (filtered by your ids or tag, plus transitive upstream deps). Each inner array can run in parallel; layer N waits on layer N-1.

`tasks[id].cwd` is the absolute working directory the task will run in.

`tasks[id].env` is the resolved env from config (global `env` merged with task-local `env`). `process.env` is not included here but is inherited at spawn time.

`tasks[id].dependencies` is the full transitive upstream closure.

No processes are spawned.

## JUnit report

Pass `--junit <path>` to write a [JUnit XML](https://llg.cubic.org/docs/junit/) report on exit. Each task becomes a `<testcase>`:

- Success: `<testcase>` with just `time`.
- Failure: `<testcase>` wraps a `<failure>` with the captured stderr inside CDATA.
- Cascade-skipped: `<testcase>` with `<skipped>`.

Works in both TUI and linear modes. Parent directories are created if missing.

```sh
layermix run --junit report.xml -t test
```

The `classname` attribute is the task's tags joined by `.` (or `task` if untagged). `name` is the task id. CI UIs that group by classname will bucket tasks under their tag.

GitHub Actions consumers include [`dorny/test-reporter`](https://github.com/dorny/test-reporter) and [`mikepenz/action-junit-report`](https://github.com/mikepenz/action-junit-report).

GitLab CI consumes it natively via [`artifacts:reports:junit`](https://docs.gitlab.com/ci/yaml/artifacts_reports/#artifactsreportsjunit):

```yaml
test:
  script:
    - npx @layermix/cli -t test --junit report.xml
  artifacts:
    when: always
    reports:
      junit: report.xml
```

Per-task results show up in the merge-request widget with failure output inline.

## Agent skill file

Projects that use `layermix` can ship a Claude Code skill file that teaches the agent how to use the tool correctly: which flags are safe, how to read `task-runner.json`, when to prefer `--dry-run-json`, how to interpret failures.

Grab [`agent-skill.md`](https://github.com/layermix-labs/cli/blob/master/agent-skill.md) and drop it in:

```sh
mkdir -p .claude/skills/layermix
curl -fsSL https://raw.githubusercontent.com/layermix-labs/cli/master/agent-skill.md \
  -o .claude/skills/layermix/SKILL.md
```

The file is a self-contained Markdown doc with YAML frontmatter (`name` + `description`). Claude Code auto-loads it when the user mentions building, testing, or running tasks in a repo that has a `task-runner.json`. For other tools (Cursor rules, `AGENTS.md`, etc.) drop it wherever that tool expects its rules.

## See also

- [task-runner.json reference](./config.md)
- [CLI reference](./cli-reference.md)
- [Scenarios](./scenarios.md)
