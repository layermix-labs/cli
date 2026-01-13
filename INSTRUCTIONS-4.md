# Task 4: Advanced UI Features & Waterfall

## Goal
Take the UI to the "Next Level" with the requested Overview tab, Waterfall visualization, and interactive controls for failed tasks.

## Requirements

### 1. The Overview Tab (Waterfall)
- This should be the default tab.
- **Visualization:**
    - Render a Gantt-chart/Waterfall style view.
    - X-Axis: Time.
    - Y-Axis: Tasks.
    - Bars represent task duration.
    - Color codes match status (Green/Red/Blue).
- **Implementation:**
    - Calculate relative start times and durations.
    - Render using block characters (e.g., `█`, `▓`, `░`).
    - Update dynamically as tasks progress.

### 2. Statistics
- On the Overview tab, below the waterfall, show:
    - Total duration.
    - Success/Failure count.
    - "Bottleneck": The longest running task on the critical path.

### 3. Interactive Controls for Failures
- When a task is in `FAILURE` state and selected:
    - Display a menu at the bottom of the view.
    - **Options:**
        1.  **Retry:** Re-queue this task (and reset its dependents).
        2.  **Copy Logs:** Copy the task's stdout/stderr to the system clipboard (use `clipboardy` or similar).
        3.  **Close:** Acknowledge the error and hide the task (or stop the session).

### 4. Selection Mode
- Allow the user to "Mark" multiple tasks in the initial list (before execution starts) if running in an interactive selection mode.
    - `my-runner interactive`: Opens a checklist of all available tasks.
    - User toggles with Space, confirms with Enter.

## Deliverables
- fully functional Overview tab with Waterfall.
- Ability to retry failed tasks without restarting the whole CLI.
- Clipboard integration.
