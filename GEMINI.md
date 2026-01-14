# Project Context: CLI2 Task Runner

## Project Overview
This project is a TypeScript-based task runner CLI, designed to manage and execute tasks with complex dependencies. It features a Directed Acyclic Graph (DAG) scheduler to resolve task execution order and supports configuration via `task-runner.json`.

**Key Features:**
*   **Dependency Resolution:** Automatically calculates execution order based on task dependencies using a DAG.
*   **Configuration:** Flexible configuration using `task-runner.json` with Zod schema validation.
*   **Cycle Detection:** Prevents execution if circular dependencies are detected.
*   **Execution Layers:** Groups independent tasks into layers for potential parallel execution.

## Tech Stack
*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **Package Manager:** pnpm
*   **Core Libraries:**
    *   `commander`: CLI framework.
    *   `zod`: Schema validation.
    *   `cosmiconfig`: Configuration loading.
    *   `graph-data-structure`: Graph algorithms (Topological sort, Cycle detection).
    *   `vitest`: Testing framework.

## Building and Running

### Prerequisites
*   Node.js (Ensure compatibility with the project's requirements)
*   pnpm

### Commands
*   **Install Dependencies:**
    ```bash
    pnpm install
    ```
*   **Run CLI (Development):**
    ```bash
    npm start -- [command] [options]
    ```
    *   Example: `npm start list`
    *   Example: `npm start validate`
*   **Run Tests:**
    ```bash
    npm test
    ```

## Development Conventions

### Directory Structure
*   `src/cli/`: Contains the CLI entry point (`index.ts`) and command definitions.
*   `src/core/`: Contains core logic like configuration loading (`config-loader.ts`) and DAG processing (`task-graph.ts`).
*   `src/types/`: TypeScript interfaces and Zod schemas (`config.ts`).

### Configuration (`task-runner.json`)
The project relies on a `task-runner.json` file for defining tasks.
*   **Schema:** Defined in `src/types/config.ts`.
*   **Fields:**
    *   `tasks`: Array of task objects (`id`, `cmd`, `dependsOn`, `tags`, etc.).
    *   `env`: Global environment variables.

### Testing
*   Unit tests are located in `__tests__` directories (e.g., `src/core/__tests__/`).
*   Tests are written using `vitest`.
