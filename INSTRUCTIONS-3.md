# Task 3: Interactive TUI (The "Slick" Interface)

## Goal
Implement the "slick" interactive terminal user interface using `Ink`. This will replace the standard text output when the user runs the tool without specific CI flags.

## Tech Stack
- **Framework:** `Ink` (React for CLI).
- **Components:** `ink-spinner`, custom made tabs that support colors etc.

## Requirements

### 1. Setup Ink
- Set up the React render loop in the CLI entry point.
- Ensure graceful fallback: Check `process.stdout.isTTY`. If false, fallback to the linear runner from Task 2.

### 2. Layout & Tabs
- Implement a main App component with a Tab system.
- **Tabs:**
    - **Overview:** (Placeholder for Task 4).
    - **[Task Name]:** One tab per running/queued task.
    - **Navigation:** Use Left/Right arrow keys or specific shortcuts (e.g., `Ctrl+Tab`) to switch.

### 3. Task List (Tabs)
- **Visuals:**
    - Show a list of all tasks in the current execution set.
    - Use colors as requested:
        - `green`: Success.
        - `red`: Failure.
        - `blue`: Running (with a spinner).
        - `yellow`: Queued.

### 4. Task Detail View (The Tab Content)
- When a user selects a Task Tab:
    - Show the **live** streamed output of that task.
    - Unlike the "Linear" mode in Task 2, this must stream real-time.
    - Support scrolling (if `ink` supports it cleanly, otherwise tail the logs).

### 5. Integration with Executor
- Connect the `Executor` from Task 2 to the Ink State.
- The Executor should emit events (`task-update`) that update the React state, triggering re-renders.
- Ensure performance: Don't re-render on every single byte of stdout. Batch updates if necessary.

## Deliverables
- A beautiful TUI that launches when running `my-runner`.
- Navigation between tasks.
- Real-time status updates and log streaming.
