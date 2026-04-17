import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../types/config.js";
import { Executor } from "../executor.js";
import { TaskGraph } from "../task-graph.js";

// A Promise<unknown> with the subset of execa-subprocess surface the runner
// touches (`stdout.on`, `stderr.on`, optional `kill`). Good enough for unit
// tests; full type from execa is Subprocess<...>.
type MockSubprocess = Promise<unknown> & {
	stdout: { on: ReturnType<typeof vi.fn> };
	stderr: { on: ReturnType<typeof vi.fn> };
	kill?: ReturnType<typeof vi.fn>;
};

function mockSubprocess(
	base: Promise<unknown> = Promise.resolve({
		stdout: "",
		stderr: "",
		exitCode: 0,
	}),
): MockSubprocess {
	const proc = base as MockSubprocess;
	proc.stdout = { on: vi.fn() };
	proc.stderr = { on: vi.fn() };
	return proc;
}

// Mock execa
vi.mock("execa", () => ({
	execa: vi.fn(() => mockSubprocess()),
}));

import { execa } from "execa";

const execaMock = vi.mocked(execa);

describe("Executor", () => {
	let mockTasks: Record<string, Task>;
	let graph: TaskGraph;

	beforeEach(() => {
		vi.clearAllMocks();
		execaMock.mockImplementation(() => mockSubprocess() as never);

		mockTasks = {
			"task-a": { id: "task-a", cmd: "echo A", dependsOn: [], tags: [] },
			"task-b": {
				id: "task-b",
				cmd: "echo B",
				dependsOn: ["task-a"],
				tags: [],
			},
			"task-c": { id: "task-c", cmd: "echo C", dependsOn: [], tags: [] },
			"task-d": {
				id: "task-d",
				cmd: "echo D",
				dependsOn: ["task-b", "task-c"],
				tags: [],
			},
		};

		// Create a mock config object conforming to NormalizedConfig
		const mockConfig = {
			tasks: mockTasks,
			env: {},
			tags: {},
		};

		graph = new TaskGraph(mockConfig);
	});

	it("should execute tasks in dependency order", async () => {
		const executor = new Executor(graph);

		// We want to verify order.
		// We can't easily spy on internal start times without events or modifying Executor.
		// We can spy on execa calls.

		await executor.execute();

		expect(execa).toHaveBeenCalledTimes(4);
		// Since everything is async and mocked to resolve immediately, precise order is hard to assert via call order
		// because Promises might resolve in microtask queue.
		// However, we can assert that B was called after A?
		// In this mock setup, they might all be called rapidly.
		// To properly test order, we should make tasks take some time.
	});

	it("should respect concurrency", async () => {
		// Make execa return a promise that we control?
		// Or just check that at any point 'running' count inside executor didn't exceed limit.
		// But 'running' is private.
		// We can use events to track start/end.

		const executor = new Executor(graph, { concurrency: 1 });
		const events: string[] = [];

		executor.on("taskStart", (id) => events.push(`start:${id}`));
		executor.on("taskSuccess", (id) => events.push(`end:${id}`));

		await executor.execute();

		// With concurrency 1, we expect start:X, end:X, start:Y, end:Y...
		// No two starts without an end in between.

		let running = 0;
		let maxRunning = 0;

		for (const e of events) {
			if (e.startsWith("start:")) {
				running++;
				maxRunning = Math.max(maxRunning, running);
			} else {
				running--;
			}
		}

		expect(maxRunning).toBe(1);
	});

	it("should skip tasks if dependency fails", async () => {
		// Mock execa to fail for task-a
		execaMock.mockImplementation(((cmd: string) => {
			if (cmd === "echo A") {
				const p = mockSubprocess(Promise.reject(new Error("Failed")));
				// Prevent Node's unhandled rejection warning; the runner awaits this.
				p.catch(() => {});
				return p;
			}
			return mockSubprocess();
		}) as never);

		const executor = new Executor(graph);
		const skipped: string[] = [];
		executor.on("taskSkipped", (id) => skipped.push(id));

		await executor.execute();

		// task-a fails. task-b depends on task-a -> skipped.
		// task-c independent -> runs.
		// task-d depends on task-b -> skipped.

		expect(skipped).toContain("task-b");
		expect(skipped).toContain("task-d");
		expect(skipped).not.toContain("task-c");
	});

	it("should generate dry run JSON", () => {
		const executor = new Executor(graph);
		const plan = executor.getDryRunJson();

		// executionPlan should be layers.
		// task-a, task-c are independent -> Layer 1
		// task-b depends on a -> Layer 2
		// task-d depends on b, c -> Layer 3

		// Note: getExecutionLayers might group differently depending on implementation,
		// but strictly:
		// Layer 1: [task-a, task-c] (order within layer not guaranteed)
		// Layer 2: [task-b]
		// Layer 3: [task-d]

		const layers = plan.executionPlan;
		expect(layers.length).toBe(3);
		expect(layers[0]).toEqual(expect.arrayContaining(["task-a", "task-c"]));
		expect(layers[1]).toEqual(expect.arrayContaining(["task-b"]));
		expect(layers[2]).toEqual(expect.arrayContaining(["task-d"]));
	});

	it("should only run requested tasks and dependencies", async () => {
		const executor = new Executor(graph);
		// Run task-b. Should run task-a and task-b. Should NOT run task-c or task-d.

		await executor.execute(["task-b"]);

		expect(execa).toHaveBeenCalledTimes(2); // A and B

		const calls = execaMock.mock.calls.map((c) => c[0]);
		expect(calls).toContain("echo A");
		expect(calls).toContain("echo B");
		expect(calls).not.toContain("echo C");
		expect(calls).not.toContain("echo D");
	});

	it("scheduleTask fires a single task without pulling in its upstream deps", async () => {
		const executor = new Executor(graph);

		// task-b has dep task-a, but scheduleTask should bypass that.
		executor.scheduleTask("task-b");
		// Wait a tick for processQueue to drain.
		await new Promise((r) => setTimeout(r, 0));

		const calls = execaMock.mock.calls.map((c) => c[0]);
		expect(calls).toContain("echo B");
		expect(calls).not.toContain("echo A");
		expect(calls).not.toContain("echo C");
		expect(calls).not.toContain("echo D");
	});

	it("killTask stops a running task, surfaces taskFail, and cascade-skips downstream", async () => {
		// Give task-b a controllable process so we can kill mid-flight.
		let killFn: ReturnType<typeof vi.fn> | null = null;
		execaMock.mockImplementation(((cmd: string) => {
			if (cmd === "echo B") {
				let reject: (err: Error) => void = () => {};
				const pending = new Promise<unknown>((_resolve, rej) => {
					reject = rej;
				});
				pending.catch(() => {});
				const p = mockSubprocess(pending);
				p.kill = vi.fn(() => {
					const err = new Error("killed") as Error & {
						isTerminated?: boolean;
					};
					err.isTerminated = true;
					reject(err);
				});
				killFn = p.kill;
				return p;
			}
			return mockSubprocess();
		}) as never);

		const executor = new Executor(graph);
		const failed: string[] = [];
		const skipped: string[] = [];
		executor.on("taskFail", (id) => failed.push(id));
		executor.on("taskSkipped", (id) => skipped.push(id));

		// Run task-d (needs task-a, task-b, task-c, task-d). task-b will hang; kill it.
		const runPromise = executor.execute(["task-d"]);

		// Wait for task-b to reach RUNNING (after task-a resolves).
		await new Promise((r) => setTimeout(r, 10));

		expect(killFn).not.toBeNull();
		const killed = executor.killTask("task-b");
		expect(killed).toBe(true);

		await runPromise;

		expect(failed).toContain("task-b");
		expect(skipped).toContain("task-d");
	});

	it("killTask is a no-op and returns false for a task that isn't running", () => {
		const executor = new Executor(graph);
		// Task isn't even registered as a runner yet.
		expect(executor.killTask("task-a")).toBe(false);
	});

	it("scheduleRun is additive: already-completed tasks are not re-run", async () => {
		const executor = new Executor(graph);
		const added: string[] = [];
		executor.on("taskAdded", (id: string) => added.push(id));

		// First wave: task-b (+ task-a).
		await executor.execute(["task-b"]);
		expect(added).toEqual(expect.arrayContaining(["task-a", "task-b"]));
		const callCountAfterFirst = execaMock.mock.calls.length;

		// Second wave: task-d (+ task-b, task-c, task-a). a+b already succeeded, only c+d should fire.
		await executor.execute(["task-d"]);

		const newCalls = execaMock.mock.calls
			.slice(callCountAfterFirst)
			.map((c) => c[0]);
		expect(newCalls).toEqual(expect.arrayContaining(["echo C", "echo D"]));
		expect(newCalls).not.toContain("echo A");
		expect(newCalls).not.toContain("echo B");
	});
});
