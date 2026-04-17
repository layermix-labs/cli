import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import type { Task } from "../types/config.js";
import { resolveArgValues, substituteCmd } from "./cmd-args.js";
import type { TaskGraph } from "./task-graph.js";
import { TaskRunner } from "./task-runner.js";

interface ExecutorOptions {
	concurrency?: number;
	dryRun?: boolean;
	globalEnv?: Record<string, string>;
	rootDir?: string;
}

interface ResolvedTask {
	id: string;
	cmd: string;
	cwd: string;
	env: Record<string, string>;
	dependsOn: string[];
	dependencies: string[];
	tags: string[];
}

interface ExecutionPlan {
	root: string;
	executionPlan: string[][];
	tasks: Record<string, ResolvedTask>;
}

export class Executor extends EventEmitter {
	private taskRunners: Map<string, TaskRunner> = new Map();
	private concurrency: number;

	// State
	private pending = new Set<string>();
	private completed = new Set<string>();
	private failed = new Set<string>();
	private skipped = new Set<string>();
	private running = new Map<string, Promise<void>>();
	// Tasks in this set bypass the dependency check once, so `scheduleTask`
	// can fire a single task on demand regardless of upstream state.
	private forceRun = new Set<string>();
	// Pending arg values per task, keyed by task id. Set via setTaskArgs()
	// before scheduling; consumed (and cleared) by startTask. Persists across
	// retries — re-running a task uses the last collected values, which matches
	// the TUI's "Retry" button intent.
	private taskArgs = new Map<string, (string | string[] | undefined)[]>();

	private isProcessing = false;
	private processQueuePromise: Promise<void> | null = null;

	constructor(
		private graph: TaskGraph,
		private options: ExecutorOptions = {},
	) {
		super();
		this.concurrency = options.concurrency || os.cpus().length;
	}

	/**
	 * Starts a full execution of the graph (or subgraph).
	 * Returns a promise that resolves when the queue is drained.
	 */
	async execute(targetTaskIds?: string[], tag?: string): Promise<boolean> {
		if (this.options.dryRun) {
			// Dry run implementation as before
			return true;
		}

		this.scheduleRun(targetTaskIds, tag);
		if (this.processQueuePromise) {
			await this.processQueuePromise;
		}
		return this.failed.size === 0;
	}

	/**
	 * Schedules a set of tasks (and their upstream deps) into the running queue
	 * without wiping existing state. Safe to call repeatedly from the TUI as
	 * the user triggers tags / tasks interactively. Already-running or
	 * already-succeeded tasks are left alone; failed/skipped ones are reset.
	 *
	 * `force: true` additionally resets already-completed *seed* tasks so the
	 * caller can re-run a tag (or a specific task) after it already finished.
	 * Deps are not force-reset — re-running a tag doesn't need to re-build its
	 * upstream closure.
	 */
	scheduleRun(
		targetTaskIds?: string[],
		tag?: string,
		opts?: { force?: boolean },
	): void {
		const force = opts?.force ?? false;
		const tasksToRun = this.identifyTasks(targetTaskIds, tag);
		const seeds = force
			? new Set(this.resolveSeeds(targetTaskIds, tag))
			: undefined;
		let added = false;

		for (const id of tasksToRun) {
			if (this.enqueueTask(id, seeds)) added = true;
		}

		if (added) this.processQueue();
	}

	// Create-or-reuse a runner and decide whether the task needs to enter the
	// pending queue. Returns true iff we actually pushed it. Keeps scheduleRun
	// under the cyclomatic budget by isolating the per-task decision tree.
	private enqueueTask(id: string, forceSeeds?: Set<string>): boolean {
		const runner = this.ensureRunner(id);
		if (!runner) return false;

		if (this.running.has(id) || this.pending.has(id)) return false;

		const forceReset = !!forceSeeds?.has(id) && this.completed.has(id);
		if (!forceReset && this.completed.has(id)) return false;

		if (forceReset || this.failed.has(id) || this.skipped.has(id)) {
			runner.reset();
			this.completed.delete(id);
			this.failed.delete(id);
			this.skipped.delete(id);
			this.emit("taskReset", id);
		}
		this.pending.add(id);
		this.emit("taskQueued", id);
		return true;
	}

	// Returns an existing runner for `id` or lazily creates and registers one.
	// Emits `taskAdded` on first creation so the TUI sees mid-session tasks.
	// Returns null if the graph has no such task.
	private ensureRunner(id: string): TaskRunner | null {
		const existing = this.taskRunners.get(id);
		if (existing) return existing;
		const task = this.graph.getTask(id);
		if (!task) return null;
		const runner = new TaskRunner(task);
		runner.on("output", (data) => this.emit("taskOutput", id, data));
		this.taskRunners.set(id, runner);
		this.emit("taskAdded", id);
		return runner;
	}

	/**
	 * Schedules a single task to run right now, without pulling in its
	 * upstream dependency closure and without waiting for deps to be marked
	 * completed. Intended for the TUI's "Run" button — a manual override for
	 * power users who know the task's inputs are already in place.
	 * Use `scheduleRun([id])` for the safe "run this task + its deps" flow.
	 */
	scheduleTask(taskId: string): void {
		const runner = this.ensureRunner(taskId);
		if (!runner) return;

		if (this.running.has(taskId) || this.pending.has(taskId)) {
			// Already queued; just mark it as force-runnable so it fires on the
			// next processQueue pass even if its deps haven't completed.
			this.forceRun.add(taskId);
			this.processQueue();
			return;
		}

		if (
			this.completed.has(taskId) ||
			this.failed.has(taskId) ||
			this.skipped.has(taskId)
		) {
			runner.reset();
			this.completed.delete(taskId);
			this.failed.delete(taskId);
			this.skipped.delete(taskId);
			this.emit("taskReset", taskId);
		}

		this.pending.add(taskId);
		this.forceRun.add(taskId);
		this.emit("taskQueued", taskId);
		this.processQueue();
	}

	/**
	 * Stores positional arg values for the next execution of `taskId`. Values
	 * are 1:1 with the task's declared `args` (entry 0 → `$1`, etc.). `undefined`
	 * entries fall back to the arg's `default`. Multi-select file/folder values
	 * arrive as `string[]`. Call this before `scheduleTask` / `scheduleRun`.
	 */
	setTaskArgs(taskId: string, values: (string | string[] | undefined)[]): void {
		this.taskArgs.set(taskId, values);
	}

	/**
	 * Terminates a running task. Returns true if a kill signal was sent.
	 * The task flows through the normal failure path (taskFail event,
	 * downstream dependents cascade-skip). Safe no-op if the task isn't
	 * running.
	 */
	killTask(taskId: string): boolean {
		const runner = this.taskRunners.get(taskId);
		if (!runner) return false;
		return runner.kill();
	}

	// Shared reset path for retry / retryFailed: wipe any terminal state,
	// re-arm the runner, push to pending, and emit the reset+queued pair so
	// the UI flips from Success/Failure/Skipped back to Queued. Callers that
	// still need to run `processQueue()` afterwards do it themselves.
	private resetTaskToPending(id: string): void {
		const runner = this.taskRunners.get(id);
		if (!runner) return;
		runner.reset();
		this.completed.delete(id);
		this.failed.delete(id);
		this.skipped.delete(id);
		this.pending.add(id);
		this.emit("taskReset", id);
		this.emit("taskQueued", id);
	}

	/**
	 * Retries a specific task and its dependents.
	 * Resets their state and resumes execution.
	 */
	async retry(taskId: string) {
		const dependents = this.graph.getAllDependents(taskId);
		const toReset = new Set([taskId, ...dependents]);

		for (const id of toReset) this.resetTaskToPending(id);

		this.emit("retry", taskId);
		await this.processQueue();
	}

	/**
	 * Resets currently-failed tasks plus their downstream dependents and
	 * re-queues them. Pass `filterIds` to restrict the scope (e.g. tag view
	 * only retries failures within that tag). Omit to retry every failure in
	 * the graph. No-op when nothing in scope has failed.
	 */
	async retryFailed(filterIds?: string[]): Promise<void> {
		const allFailed = Array.from(this.failed);
		const scope = filterIds
			? allFailed.filter((id) => filterIds.includes(id))
			: allFailed;
		if (scope.length === 0) return;

		const toReset = new Set<string>();
		for (const id of scope) {
			toReset.add(id);
			for (const d of this.graph.getAllDependents(id)) toReset.add(d);
		}

		for (const id of toReset) this.resetTaskToPending(id);

		await this.processQueue();
	}

	// Scans the pending set once: cascades skips for tasks whose upstream
	// already failed, and returns the ids that are ready to run right now.
	private collectReadyTasks(): string[] {
		const ready: string[] = [];

		for (const taskId of Array.from(this.pending)) {
			const task = this.graph.getTask(taskId);
			if (!task) continue;

			if (this.forceRun.has(taskId)) {
				ready.push(taskId);
				continue;
			}

			const anyDepFailed = task.dependsOn.some(
				(d) => this.failed.has(d) || this.skipped.has(d),
			);
			if (anyDepFailed) {
				this.cascadeSkip(taskId);
				continue;
			}

			const allDepsMet = task.dependsOn.every((d) => this.completed.has(d));
			if (allDepsMet) ready.push(taskId);
		}

		return ready;
	}

	private cascadeSkip(taskId: string): void {
		this.skipped.add(taskId);
		this.pending.delete(taskId);
		const runner = this.taskRunners.get(taskId);
		if (!runner) return;
		runner.skip();
		this.emit("taskSkipped", taskId);
	}

	// Starts a single ready task; returns false if no runner exists so the
	// caller knows to skip over it.
	private startTask(taskId: string): boolean {
		const runner = this.taskRunners.get(taskId);
		if (!runner) return false;
		this.pending.delete(taskId);
		this.forceRun.delete(taskId);

		this.emit("taskStart", taskId);

		const argValues = this.taskArgs.get(taskId);
		const promise = runner
			.execute(argValues)
			.then(() => {
				this.completed.add(taskId);
				this.emit("taskSuccess", taskId, runner.output);
			})
			.catch((err) => {
				this.failed.add(taskId);
				this.emit("taskFail", taskId, err, runner.output);
			})
			.finally(() => {
				this.running.delete(taskId);
			});

		this.running.set(taskId, promise);
		return true;
	}

	private async runQueueLoop(): Promise<void> {
		while (this.pending.size > 0 || this.running.size > 0) {
			const ready = this.collectReadyTasks();

			for (const taskId of ready) {
				if (this.running.size >= this.concurrency) break;
				this.startTask(taskId);
			}

			// No tasks running and pending has stragglers — no one can move it
			// forward, so bail out rather than spin.
			if (this.running.size === 0 && this.pending.size > 0) break;

			if (this.running.size > 0) {
				await Promise.race(this.running.values());
			}
		}
	}

	private async processQueue() {
		if (this.isProcessing && this.processQueuePromise) {
			return this.processQueuePromise;
		}

		this.isProcessing = true;

		this.processQueuePromise = (async () => {
			try {
				await this.runQueueLoop();
			} finally {
				this.isProcessing = false;
				this.processQueuePromise = null;
			}
		})();

		return this.processQueuePromise;
	}

	// Walk the given subset layer-by-layer: a task lands in the current layer
	// once none of its dependencies remain in the working set. Keeps layering
	// scoped to the target subgraph (TaskGraph.getExecutionLayers walks the
	// full graph — different semantics, don't unify).
	private computeLayers(
		tasksToRun: Set<string>,
		subGraphTasks: Record<string, Task>,
	): string[][] {
		const layers: string[][] = [];
		let currentSet = new Set(tasksToRun);

		while (currentSet.size > 0) {
			const layer: string[] = [];
			for (const taskId of currentSet) {
				const task = subGraphTasks[taskId];
				if (!task.dependsOn.some((d) => currentSet.has(d))) {
					layer.push(taskId);
				}
			}
			if (layer.length === 0) break;
			layers.push(layer);
			const nextSet = new Set(currentSet);
			for (const id of layer) nextSet.delete(id);
			currentSet = nextSet;
		}

		return layers;
	}

	private resolveTask(id: string, task: Task, rootDir: string): ResolvedTask {
		const globalEnv = this.options.globalEnv || {};
		const argValues = this.taskArgs.get(id);
		const cmd =
			task.args && task.args.length > 0
				? this.resolveCmdForDryRun(task, argValues)
				: task.cmd;
		return {
			id,
			cmd,
			cwd: path.resolve(rootDir, task.cwd || "."),
			env: { ...globalEnv, ...(task.env || {}) },
			dependsOn: task.dependsOn,
			dependencies: Array.from(this.graph.getAllDependencies(id)),
			tags: task.tags,
		};
	}

	// Dry-run cmd substitution must not throw — partial / missing arg values
	// are normal here (the caller is asking "what would run?", not "run it
	// now"). Unfilled placeholders stay as `$N` so the user can see exactly
	// which inputs they still need to supply.
	private resolveCmdForDryRun(
		task: Task,
		argValues?: (string | string[] | undefined)[],
	): string {
		try {
			const declared = task.args ?? [];
			const resolved = resolveArgValues(declared, argValues ?? []);
			return substituteCmd(task.cmd, resolved);
		} catch {
			return task.cmd;
		}
	}

	getDryRunJson(targetTaskIds?: string[], tag?: string): ExecutionPlan {
		const tasksToRun = this.identifyTasks(targetTaskIds, tag);
		const subGraphTasks: Record<string, Task> = {};
		for (const id of tasksToRun) {
			const task = this.graph.getTask(id);
			if (task) subGraphTasks[id] = task;
		}

		const rootDir = this.options.rootDir || process.cwd();
		const resolved: Record<string, ResolvedTask> = {};
		for (const id of tasksToRun) {
			resolved[id] = this.resolveTask(id, subGraphTasks[id], rootDir);
		}

		return {
			root: rootDir,
			executionPlan: this.computeLayers(tasksToRun, subGraphTasks),
			tasks: resolved,
		};
	}

	// Seeds = the user's explicit target set (no dep closure). `identifyTasks`
	// adds the upstream closure on top. Shared so scheduleRun(force) can
	// distinguish "seeds to force-reset" from "deps that should stay cached".
	private resolveSeeds(targetTaskIds?: string[], tag?: string): string[] {
		const tasks = this.graph.getTasks();
		if (targetTaskIds && targetTaskIds.length > 0) {
			return targetTaskIds.filter((id) => tasks[id]);
		}
		if (tag) {
			return Object.values(tasks)
				.filter((t) => t.tags.includes(tag))
				.map((t) => t.id);
		}
		return Object.keys(tasks);
	}

	public identifyTasks(targetTaskIds?: string[], tag?: string): Set<string> {
		const seeds = this.resolveSeeds(targetTaskIds, tag);
		const result = new Set<string>();

		for (const seed of seeds) {
			result.add(seed);
			const deps = this.graph.getAllDependencies(seed);
			for (const d of deps) result.add(d);
		}

		return result;
	}
}
