# Task 2: Task Execution Engine (The "Runner")

## Goal
Build the backend engine that actually executes the tasks. This component will handle concurrency, process isolation, and log capturing. It needs to be robust enough to handle the DAG structure defined in Task 1.

## Tech Stack
- **Node.js:** `child_process` (specifically `spawn` or `execa` for better cross-platform support).
- **Libraries:**
    - `execa`: Recommended for better shell handling.
    - `rxjs` (Optional but recommended): For managing the stream of events (start, data, error, complete) from multiple running tasks.

## Requirements

### 1. The Executor Class
- Create an `Executor` class that takes a `TaskGraph` (from Task 1).
- **Concurrency:**
    - Respect `dependsOn`. Task B cannot start until Task A succeeds.
    - Tasks that have their dependencies met should start immediately, up to a defined `maxConcurrency` limit (default to CPU cores).

### 2. Task Wrappers
- Wrap the raw process execution in a `TaskRunner` class.
- **Responsibilities:**
    - Spawning the shell command.
    - capturing `stdout` and `stderr`.
    - Buffering logs (we need to show them later in the UI, or print them if strictly CLI).
    - Tracking state: `IDLE`, `QUEUED`, `RUNNING`, `SUCCESS`, `FAILURE`.
    - Measuring execution time (start time, end time, duration).

### 3. CLI Execution Modes
- Implement the main run logic in the CLI:
    - `my-runner run <task-id>`: Runs specific task(s) and their dependencies.
    - `my-runner run --tag <tag-name>`: Runs all tasks matching a tag.

### 4. Output Handling (Non-Interactive)
- Implement the "Linear" output mode for when not in interactive TUI mode.
- **Requirement:** "Output should come out ordered."
    - Since tasks run in parallel, raw output would be garbled.
    - **Strategy:** Buffer output per task. Only print a task's full output to the console *after* it has finished.
    - Print a header before output: `[Task A] Starting...` -> `[Task A] Finished (Success)`.
- Implement `--output-only-failed`:
    - If set, successful tasks remain silent (or just show a summary line).
    - Failed tasks dump their buffered stderr/stdout.

### 5. "Dry Run" JSON
- Implement the `--dry-run-json` flag.
- Output a JSON structure representing the execution plan:
    ```json
    {
      "executionPlan": [
        ["task-a", "task-b"], // Tier 1 (parallel)
        ["task-c"]            // Tier 2 (dependent)
      ]
    }
    ```
- This satisfies the "AI Friendly" requirement for introspection.

## Deliverables
- A working runner that can execute tasks defined in `task-runner.json`.
- Correct handling of dependencies (dependent tasks don't start if dependency fails).
- Proper exit codes (CLI exits with 1 if any task fails).
