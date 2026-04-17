---
"@layermix/cli": minor
---

TUI improvements:

- **Keyboard navigation:** added single-key shortcuts (`r`, `R`, `c`, `K`, `x`) for the TaskDetail action menu, plus arrow/`h`/`l` cycling and `Enter` to activate.
- **UX polish:** clearer overview waterfall, refreshed sidebar/tag/task layout, and improved status visibility in the top bar.
- **Performance:** drastically reduced TUI flicker for chatty tasks. Stdout chunks are now coalesced into one render per ~16ms frame, the Overview duration ticker only runs while tasks are active, and the log pane reuses rows on scroll/tail instead of remounting them. A 5000-line per-task log buffer keeps memory bounded for long-running tasks.
