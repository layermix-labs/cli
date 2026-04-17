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
import { parseDefaultRun } from "./default-run.js";
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

// Apply --arg values to the single target task. Throws (via exitWithError)
// when the user passes --arg with a tag or multiple ids — there's no
// unambiguous mapping from positional values to a target in that case.
// Comma-separated values fan out into a string[] for multi-select args.
function applyCliArgs(
	executor: Executor,
	cliArgs: string[],
	targetIds: string[] | undefined,
	tag: string | undefined,
): void {
	if (cliArgs.length === 0) return;
	if (!targetIds || targetIds.length !== 1) {
		exitWithError(
			new Error(
				`--arg can only be used with a single task target (got ${
					targetIds?.length ?? 0
				} ids${tag ? ` plus tag ${tag}` : ""})`,
			),
		);
	}
	const values: (string | string[])[] = cliArgs.map((v) =>
		v.includes(",") ? v.split(",").map((p) => p.trim()) : v,
	);
	executor.setTaskArgs(targetIds[0], values);
}

// TUI render path. Encapsulates the alt-screen lifecycle + Ink render so the
// main `run` action stays a flat dispatch between TUI and linear modes.
async function runTui(
	executor: Executor,
	config: ReturnType<ConfigLoader["load"]>,
	initialRun:
		| {
				taskIds?: string[];
				tag?: string;
				cliArgsProvided: boolean;
		  }
		| undefined,
	flushJunit: () => void,
): Promise<void> {
	enterAltScreen();
	enableMouseReporting();
	const app = render(
		<App
			executor={executor}
			allTasks={Object.values(config.tasks)}
			tagDescriptions={config.tags}
			groupDescriptions={config.groups}
			rootDir={process.cwd()}
			initialRun={initialRun}
		/>,
		{ patchConsole: false },
	);
	await app.waitUntilExit();
	disableMouseReporting();
	exitAltScreen();
	flushJunit();
	process.exit(0);
}

// Linear (non-TUI) path: wire console logging, honor the no-target hint when
// not in CI mode, otherwise execute and bubble exit code. `tag` is passed
// separately from `options` because `defaultRun` may have synthesized one.
async function runLinear(
	executor: Executor,
	options: { outputOnlyFailed?: boolean },
	hasExplicitTarget: boolean,
	ciMode: boolean,
	targetIds: string[] | undefined,
	tag: string | undefined,
	flushJunit: () => void,
): Promise<void> {
	wireLinearLogging(executor, options);
	if (!hasExplicitTarget && !ciMode) {
		console.log(
			chalk.yellow(
				"No tasks specified. Pass task ids or -t <tag>, set `defaultRun` in task-runner.json, or run `layermix list` to see available tasks.",
			),
		);
		return;
	}
	const success = await executor.execute(targetIds, tag);
	flushJunit();
	if (!success) process.exit(1);
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
	.version("2.2.0");

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
				const labels: string[] = [];
				if (task.tags.length) labels.push(`tags: ${task.tags.join(", ")}`);
				if (task.group) labels.push(`group: ${task.group}`);
				console.log(
					`- ${chalk.bold(task.id)}: ${task.cmd} ${labels.length ? chalk.gray(`[${labels.join("; ")}]`) : ""}`,
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

			const groupEntries = Object.entries(config.groups);
			if (groupEntries.length > 0) {
				console.log(chalk.cyan("\nGroups:"));
				groupEntries
					.sort(([a], [b]) => a.localeCompare(b))
					.forEach(([name, description]) => {
						console.log(`- ${chalk.blue(name)}: ${description}`);
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

			const starter = {
				$schema: "https://unpkg.com/@layermix/cli@2.2.0/schema.json",
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
	.option(
		"-a, --arg <value>",
		"Positional arg value for the target task. Repeat in order ($1, $2, ...). Use comma-separated values for multi-select file/folder args, e.g. -a 'a.spec.ts,b.spec.ts'.",
		(value: string, prev: string[] = []) => prev.concat([value]),
		[] as string[],
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

			if (options.dryRunJson) {
				const plan = executor.getDryRunJson(
					taskIds.length ? taskIds : undefined,
					options.tag,
				);
				console.log(JSON.stringify(plan, null, 2));
				return;
			}

			const ciMode = !!options.ci || !!options.ai || isCI || isAiAgent();
			const flushJunit = setupJunitCollection(
				executor,
				config,
				options,
				ciMode,
			);
			const cliArgs: string[] = options.arg ?? [];

			let hasExplicitTarget = taskIds.length > 0 || !!options.tag;
			let targetIds: string[] | undefined = taskIds.length
				? taskIds
				: undefined;
			let tag: string | undefined = options.tag;

			const useTui = process.stdout.isTTY && !ciMode;
			// `defaultRun` only kicks in for non-TUI sessions with no
			// user-supplied target. TUI sessions stay idle so the user keeps
			// the explicit "pick what to run" UX.
			if (!hasExplicitTarget && !useTui && config.defaultRun) {
				const parsed = parseDefaultRun(config.defaultRun);
				targetIds = parsed.taskIds;
				tag = parsed.tag;
				hasExplicitTarget = !!targetIds || !!tag;
			}

			applyCliArgs(executor, cliArgs, targetIds, tag);

			if (useTui) {
				await runTui(
					executor,
					config,
					hasExplicitTarget
						? {
								taskIds: targetIds,
								tag,
								// Skip the picker for the initial CLI invocation when values
								// were already supplied via --arg; otherwise the flag is a noop.
								cliArgsProvided: cliArgs.length > 0,
							}
						: undefined,
					flushJunit,
				);
				return;
			}

			await runLinear(
				executor,
				options,
				hasExplicitTarget,
				ciMode,
				targetIds,
				tag,
				flushJunit,
			);
		} catch (error) {
			exitWithError(error);
		}
	});

program.parse(process.argv);
