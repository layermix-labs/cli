import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import type { Task } from "../types/config.js";
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
	 */
	scheduleRun(targetTaskIds?: string[], tag?: string): void {
		const tasksToRun = this.identifyTasks(targetTaskIds, tag);
		let added = false;

		for (const id of tasksToRun) {
			let runner = this.taskRunners.get(id);
			if (!runner) {
				const task = this.graph.getTask(id);
				if (!task) continue;
				runner = new TaskRunner(task);
				runner.on("output", (data) => this.emit("taskOutput", id, data));
				this.taskRunners.set(id, runner);
				this.emit("taskAdded", id);
			}

			if (
				this.running.has(id) ||
				this.completed.has(id) ||
				this.pending.has(id)
			)
				continue;

			if (this.failed.has(id) || this.skipped.has(id)) {
				runner.reset();
				this.failed.delete(id);
				this.skipped.delete(id);
				this.emit("taskReset", id);
			}
			this.pending.add(id);
			added = true;
		}

		if (added) this.processQueue();
	}

	/**
	 * Schedules a single task to run right now, without pulling in its
	 * upstream dependency closure and without waiting for deps to be marked
	 * completed. Intended for the TUI's "Run" button — a manual override for
	 * power users who know the task's inputs are already in place.
	 * Use `scheduleRun([id])` for the safe "run this task + its deps" flow.
	 */
	scheduleTask(taskId: string): void {
		const task = this.graph.getTask(taskId);
		if (!task) return;

		let runner = this.taskRunners.get(taskId);
		if (!runner) {
			runner = new TaskRunner(task);
			runner.on("output", (data) => this.emit("taskOutput", taskId, data));
			this.taskRunners.set(taskId, runner);
			this.emit("taskAdded", taskId);
		}

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
		this.processQueue();
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

	/**
	 * Retries a specific task and its dependents.
	 * Resets their state and resumes execution.
	 */
	async retry(taskId: string) {
		// 1. Identify all downstream dependents
		const dependents = this.graph.getAllDependents(taskId);
		const toReset = new Set([taskId, ...dependents]);

		// 2. Reset state for these tasks
		for (const id of toReset) {
			// Only reset if we are tracking this task (it was part of initial set)
			// If a dependent wasn't part of the initial run (e.g. partial run), we might check.
			// But identifyTasks includes dependencies, not dependents.
			// If we ran a partial graph, dependents might not be in taskRunners.
			// If they are not in taskRunners, we don't need to run them (unless we want to expand the graph? No, let's stick to current scope).

			if (this.taskRunners.has(id)) {
				const runner = this.taskRunners.get(id);
				if (runner) runner.reset();

				this.completed.delete(id);
				this.failed.delete(id);
				this.skipped.delete(id);
				// Remove from running? Should not be running if we are retrying (usually called when idle).
				if (this.running.has(id)) {
					// This is tricky. If we retry while running, we might have issues.
					// Assume retry is called when things are settled or on failed tasks.
				}

				this.pending.add(id);
				this.emit("taskReset", id);
			}
		}

		// 3. Trigger processing
		this.emit("retry", taskId);
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

		const promise = runner
			.execute()
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
		return {
			id,
			cmd: task.cmd,
			cwd: path.resolve(rootDir, task.cwd || "."),
			env: { ...globalEnv, ...(task.env || {}) },
			dependsOn: task.dependsOn,
			dependencies: Array.from(this.graph.getAllDependencies(id)),
			tags: task.tags,
		};
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

	public identifyTasks(targetTaskIds?: string[], tag?: string): Set<string> {
		const tasks = this.graph.getTasks();
		const result = new Set<string>();

		let seeds: string[] = [];

		if (targetTaskIds && targetTaskIds.length > 0) {
			seeds = targetTaskIds;
		} else if (tag) {
			seeds = Object.values(tasks)
				.filter((t) => t.tags.includes(tag))
				.map((t) => t.id);
		} else {
			seeds = Object.keys(tasks);
		}

		for (const seed of seeds) {
			if (!tasks[seed]) continue;
			result.add(seed);
			const deps = this.graph.getAllDependencies(seed);
			for (const d of deps) result.add(d);
		}

		return result;
	}
}
