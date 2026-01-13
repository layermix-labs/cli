# Task 1: Core Architecture, Configuration, and DAG Scheduler

## Goal
Initialize the project structure, define the configuration schema, and implement the core task dependency resolution logic (DAG). This foundation will allow us to load tasks and understand their execution order before we even try to run them.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js
- **Libraries:**
    - `zod`: For robust schema validation of the JSON config.
    - `cosmiconfig`: For recursive configuration searching.
    - `graph-data-structure` or a simple custom implementation: For DAG topological sorting.
    - `commander`: For the CLI entry point.

## Requirements

### 1. Project Setup
- Initialize a new TypeScript Node.js project.
- Configure `tsconfig.json` for modern Node output.
- Set up a basic directory structure:
    - `src/core`: Logic for config and DAG.
    - `src/cli`: CLI entry point.
    - `src/types`: TypeScript definitions.

### 2. Configuration Schema (`task-runner.json`)
- Define the configuration structure using `zod`.
- **Fields:**
    - `tasks`: A map or array of task definitions.
    - `env`: Global environment variables.
- **Task Definition:**
    - `id`: Unique string identifier.
    - `cmd`: The shell command to run (string).
    - `dependsOn`: Array of task IDs that must complete before this one starts.
    - `tags`: Array of strings (e.g., "build", "test", "lint") to allow grouping.
    - `cwd`: (Optional) Directory to run the command in.
    - `env`: (Optional) Local environment variables.

### 3. Configuration Loading
- Implement a `ConfigLoader` class.
- Use `cosmiconfig` to find `task-runner.json` (or `.rc` variants) recursively up to the root.
- **Workspace Logic:**
    - If multiple configs are found (e.g., in a monorepo structure), implement a basic merge strategy:
        - Tasks with the same ID in a closer config override those in a parent config.
        - Unique tasks are additive.

### 4. DAG Scheduler
- Implement a `TaskGraph` class.
- **Validation:**
    - Detect and throw errors for **Circular Dependencies** (A -> B -> A).
    - Detect missing dependencies (A depends on C, but C doesn't exist).
- **Sorting:**
    - Provide a method to return the **Topological Sort** (linear execution order).
    - Provide a method to group tasks into "execution layers" (tasks that can run in parallel at the current stage). *Note: The actual runner will be more dynamic, but this is good for validation.*

### 5. CLI Entry Point
- Create `src/cli/index.ts`.
- Implement basic command structure:
    - `my-runner [command] [options]`
    - `my-runner list`: Lists all available tasks found in the config.
    - `my-runner validate`: Loads config and checks the DAG for errors.

## Deliverables
- Functional `npm start` (or equivalent) that allows running `list` and `validate`.
- Unit tests for the DAG logic (detecting cycles, correct sorting).
- A sample `task-runner.json` in the root for testing.
