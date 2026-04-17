---
"@layermix/cli": minor
---

feat(config): add optional `label` to tasks for the TUI sidebar display name

Tasks can now declare `label`, a UI-only display name that renders in the TUI sidebar, Overview waterfall, task-detail header, `list` output, and linear-mode log prefixes (`[label] Starting...`) in place of `id`. `id` stays the canonical handle everywhere else — CLI targets, `dependsOn`, JUnit `testcase` names, and dry-run JSON keys are unchanged, so labels are safe to add or rename without breaking CI integrations. The sidebar search (`/`) now matches on id *and* label.
