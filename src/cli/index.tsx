#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { render } from "ink";
import isCI from "is-ci";
import { ConfigLoader } from "../core/config-loader.js";
import { Executor } from "../core/executor.js";
import {
	type JUnitTaskResult,
	writeJUnitReport,
} from "../core/junit-report.js";
import { TaskGraph } from "../core/task-graph.js";
import App from "./ui/App.js";
import {
	disableMouseReporting,
	enableMouseReporting,
} from "./ui/useMouseWheel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer execa's `shortMessage` (one-line command summary), fall back to the
// Error message, and finally to String(error) for non-Error throwables.
function extractErrorMessage(error: unknown): string {
	if (error && typeof error === "object") {
		const withShort = error as { shortMessage?: unknown };
		if (typeof withShort.shortMessage === "string")
			return withShort.shortMessage;
		if (error instanceof Error) return error.message;
	}
	return String(error);
}

// Shared error-exit path for every subcommand. `prefix` customizes the label
// (e.g. "✕ Validation failed" for `validate`).
function exitWithError(error: unknown, prefix = "Error"): never {
	console.error(chalk.red(`${prefix}: ${extractErrorMessage(error)}`));
	process.exit(1);
}

// Emit a task's captured stdout/stderr under a separator, or skip the block
// if there's nothing to print.
function logTaskOutput(taskId: string, output: string): void {
	if (!output.trim()) return;
	console.log(chalk.gray(`--- Output for ${taskId} ---`));
	console.log(output);
	console.log(chalk.gray(`-------------------------`));
}

type CollectedResult = {
	id: string;
	classname: string;
	startedAt?: number;
	endedAt?: number;
	status: "success" | "failure" | "skipped";
	message?: string;
	output: string;
};

// Builds a per-task results map wired to the executor's lifecycle events, plus
// a flush callback that serializes that map to JUnit XML when `--junit` is on.
function setupJunitCollection(
	executor: Executor,
	config: ReturnType<ConfigLoader["load"]>,
	options: { junit?: string },
	ciMode: boolean,
): () => void {
	const results = new Map<string, CollectedResult>();
	const classnameOf = (id: string): string => {
		const task = config.tasks[id];
		if (!task || task.tags.length === 0) return "task";
		return task.tags.join(".");
	};
	const upsert = (id: string, patch: Partial<CollectedResult>) => {
		const existing = results.get(id) ?? {
			id,
			classname: classnameOf(id),
			status: "success" as const,
			output: "",
		};
		results.set(id, { ...existing, ...patch });
	};

	executor.on("taskStart", (id: string) => {
		upsert(id, { startedAt: Date.now(), status: "success", output: "" });
	});
	executor.on("taskSuccess", (id: string, output: string) => {
		upsert(id, { endedAt: Date.now(), status: "success", output });
	});
	executor.on("taskFail", (id: string, error: unknown, output: string) => {
		upsert(id, {
			endedAt: Date.now(),
			status: "failure",
			message: extractErrorMessage(error),
			output,
		});
	});
	executor.on("taskSkipped", (id: string) => {
		upsert(id, { status: "skipped" });
	});

	return () => {
		if (!options.junit) return;
		const payload: JUnitTaskResult[] = Array.from(results.values()).map(
			(r) => ({
				id: r.id,
				classname: r.classname,
				durationMs: r.startedAt && r.endedAt ? r.endedAt - r.startedAt : 0,
				status: r.status,
				message: r.message,
				output: r.output,
			}),
		);
		const abs = writeJUnitReport(options.junit, payload);
		if (!ciMode) console.log(chalk.gray(`JUnit report written to ${abs}`));
	};
}

// Linear-mode task listeners: log each lifecycle transition to stdout.
function wireLinearLogging(
	executor: Executor,
	options: { outputOnlyFailed?: boolean },
): void {
	executor.on("taskStart", (taskId: string) => {
		console.log(chalk.cyan(`[${taskId}] Starting...`));
	});
	executor.on("taskSuccess", (taskId: string, output: string) => {
		console.log(chalk.green(`[${taskId}] Finished (Success)`));
		if (!options.outputOnlyFailed) logTaskOutput(taskId, output);
	});
	executor.on("taskFail", (taskId: string, _error: unknown, output: string) => {
		console.log(chalk.red(`[${taskId}] Failed`));
		logTaskOutput(taskId, output);
	});
	executor.on("taskSkipped", (taskId: string) => {
		console.log(chalk.gray(`[${taskId}] Not Started (dependency failed)`));
	});
}

// Detects common coding-agent runtimes so output falls back to the linear,
// machine-readable mode the same way CI does. Agents we check:
//   Claude Code (CLAUDECODE, CLAUDE_CODE_ENTRYPOINT)
//   Cursor agent (CURSOR_AGENT, CURSOR_TRACE_ID)
//   Aider        (AIDER_MODEL, AIDER_CHAT_HISTORY_FILE)
//   Continue     (CONTINUE_SESSION_ID)
//   Generic      (AI_AGENT — opt-in env users can set for anything unlisted)
function isAiAgent(): boolean {
	const env = process.env;
	return !!(
		env.CLAUDECODE ||
		env.CLAUDE_CODE_ENTRYPOINT ||
		env.CURSOR_AGENT ||
		env.CURSOR_TRACE_ID ||
		env.AIDER_CHAT_HISTORY_FILE ||
		env.CONTINUE_SESSION_ID ||
		env.AI_AGENT
	);
}

// Alternate screen buffer + cursor hide. Pins the TUI to a full fresh pane,
// and restores the user's terminal scrollback on exit.
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[H\x1b[?25l";
const EXIT_ALT_SCREEN = "\x1b[?25h\x1b[?1049l";
let altScreenActive = false;

function enterAltScreen() {
	if (altScreenActive || !process.stdout.isTTY) return;
	process.stdout.write(ENTER_ALT_SCREEN);
	altScreenActive = true;
}

function exitAltScreen() {
	if (!altScreenActive) return;
	process.stdout.write(EXIT_ALT_SCREEN);
	altScreenActive = false;
}

process.on("exit", () => {
	exitAltScreen();
	disableMouseReporting();
});
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	process.on(sig, () => {
		exitAltScreen();
		disableMouseReporting();
		process.exit(1);
	});
}

const program = new Command();

program
	.name("layermix")
	.description("A simple DAG-based task runner")
	.version("1.0.0");

program
	.command("list")
	.description("Lists all available tasks")
	.action(() => {
		try {
			const loader = new ConfigLoader();
			const config = loader.load();
			const tasks = Object.values(config.tasks);

			if (tasks.length === 0) {
				console.log(chalk.yellow("No tasks found."));
				return;
			}

			console.log(chalk.cyan("Available tasks:"));
			tasks.forEach((task) => {
				console.log(
					`- ${chalk.bold(task.id)}: ${task.cmd} ${task.tags.length ? chalk.gray(`[tags: ${task.tags.join(", ")}]`) : ""}`,
				);
				if (task.description) {
					console.log(`  ${chalk.gray(task.description)}`);
				}
				if (task.dependsOn.length > 0) {
					console.log(
						`  ${chalk.gray(`Depends on: ${task.dependsOn.join(", ")}`)}`,
					);
				}
			});

			const tagEntries = Object.entries(config.tags);
			if (tagEntries.length > 0) {
				console.log(chalk.cyan("\nTags:"));
				tagEntries
					.sort(([a], [b]) => a.localeCompare(b))
					.forEach(([name, description]) => {
						console.log(`- ${chalk.magenta(`#${name}`)}: ${description}`);
					});
			}
		} catch (error) {
			exitWithError(error);
		}
	});

program
	.command("validate")
	.description("Loads config and checks the DAG for errors")
	.action(() => {
		try {
			const loader = new ConfigLoader();
			const config = loader.load();
			const graph = new TaskGraph(config);

			console.log(chalk.green("✓ Configuration is valid."));

			const layers = graph.getExecutionLayers();
			console.log(chalk.cyan("\nExecution Layers:"));
			layers.forEach((layer, i) => {
				console.log(`Layer ${i + 1}: ${layer.join(", ")}`);
			});

			const order = graph.getTopologicalSort();
			console.log(chalk.cyan("\nLinear Execution Order:"));
			console.log(order.join(" -> "));
		} catch (error) {
			exitWithError(error, "✕ Validation failed");
		}
	});

program
	.command("init")
	.description("Create a starter task-runner.json with $schema reference")
	.option("-f, --force", "Overwrite an existing task-runner.json")
	.action((options) => {
		try {
			const cwd = process.cwd();
			const target = path.join(cwd, "task-runner.json");
			if (fs.existsSync(target) && !options.force) {
				console.error(
					chalk.red(
						`task-runner.json already exists. Use --force to overwrite.`,
					),
				);
				process.exit(1);
			}

			const schemaTarget = path.join(cwd, "schema.json");
			if (!fs.existsSync(schemaTarget)) {
				const bundled = path.resolve(__dirname, "../../schema.json");
				if (fs.existsSync(bundled)) {
					fs.copyFileSync(bundled, schemaTarget);
				}
			}

			const starter = {
				$schema: "./schema.json",
				tasks: [
					{ id: "hello", cmd: "echo hello", dependsOn: [], tags: ["example"] },
					{
						id: "world",
						cmd: "echo world",
						dependsOn: ["hello"],
						tags: ["example"],
					},
				],
				env: {},
			};
			fs.writeFileSync(target, `${JSON.stringify(starter, null, 2)}\n`);
			console.log(chalk.green(`✓ Wrote ${target}`));
		} catch (error) {
			exitWithError(error);
		}
	});

program
	.command("run [taskIds...]", { isDefault: true })
	.description("Runs specific task(s) and their dependencies (default command)")
	.option("-t, --tag <tag>", "Run all tasks with a specific tag")
	.option("--dry-run-json", "Print execution plan in JSON")
	.option("--concurrency <number>", "Maximum parallel tasks", parseInt)
	.option("--output-only-failed", "Only show output for failed tasks")
	.option(
		"--ci",
		"CI mode: disable TUI and run all tasks when no target specified (auto-detected from common CI env vars)",
	)
	.option(
		"--ai",
		"AI-agent mode: same as --ci; use when invoked by a coding agent (auto-detected for Claude Code, Cursor, Aider, Continue, or via the AI_AGENT env var)",
	)
	.option(
		"--junit <path>",
		"Write a JUnit XML report to the given path on exit (consumed by GitLab CI artifacts:reports:junit, GitHub Actions test reporters, etc.)",
	)
	.action(async (taskIds, options) => {
		try {
			const loader = new ConfigLoader();
			const config = loader.load();
			const graph = new TaskGraph(config);

			const executor = new Executor(graph, {
				concurrency: options.concurrency,
				dryRun: options.dryRunJson,
				globalEnv: config.env,
				rootDir: process.cwd(),
			});

			const ciMode = !!options.ci || !!options.ai || isCI || isAiAgent();

			if (options.dryRunJson) {
				const plan = executor.getDryRunJson(
					taskIds.length ? taskIds : undefined,
					options.tag,
				);
				console.log(JSON.stringify(plan, null, 2));
				return;
			}

			const flushJunit = setupJunitCollection(
				executor,
				config,
				options,
				ciMode,
			);

			const useTui = process.stdout.isTTY && !ciMode;
			const hasExplicitTarget = taskIds.length > 0 || !!options.tag;
			const targetIds = taskIds.length ? taskIds : undefined;

			if (useTui) {
				const allTasks = Object.values(config.tasks);
				enterAltScreen();
				enableMouseReporting();
				const app = render(
					<App
						executor={executor}
						allTasks={allTasks}
						tagDescriptions={config.tags}
					/>,
					{ patchConsole: false },
				);

				if (hasExplicitTarget) {
					executor.execute(targetIds, options.tag);
				}

				await app.waitUntilExit();
				disableMouseReporting();
				exitAltScreen();
				flushJunit();
				process.exit(0);
			}

			wireLinearLogging(executor, options);

			if (!hasExplicitTarget && !ciMode) {
				console.log(
					chalk.yellow(
						"No tasks specified. Pass task ids or -t <tag>, or run `layermix list` to see available tasks.",
					),
				);
				return;
			}

			const success = await executor.execute(targetIds, options.tag);
			flushJunit();
			if (!success) process.exit(1);
		} catch (error) {
			exitWithError(error);
		}
	});

program.parse(process.argv);
