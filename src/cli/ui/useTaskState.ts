import { useEffect, useRef, useState } from "react";
import type { Executor } from "../../core/executor.js";
import type { TaskStatus } from "../../core/task-runner.js";

export interface TaskState {
	id: string;
	status: TaskStatus;
	output: string[];
	startTime?: number;
	endTime?: number;
	duration?: number;
}

// Chatty tools (tsc, vitest, biome) emit dozens of stdout chunks per second.
// Each chunk used to fire its own setState → full Ink remeasure → flicker. We
// now coalesce chunks into a single flush per ~16ms frame and cap the per-task
// ring buffer so the array spread stays cheap on long-running output.
const FLUSH_INTERVAL_MS = 16;
const MAX_OUTPUT_LINES = 5000;

export const useTaskExecutor = (executor: Executor, knownTaskIds: string[]) => {
	const [tasks, setTasks] = useState<Record<string, TaskState>>(() => {
		const initial: Record<string, TaskState> = {};
		knownTaskIds.forEach((id) => {
			initial[id] = { id, status: "IDLE", output: [] };
		});
		return initial;
	});

	const pendingOutput = useRef<Map<string, string[]>>(new Map());
	const flushTimer = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		const handleAdded = (taskId: string) => {
			setTasks((prev) => {
				if (prev[taskId]) return prev;
				return {
					...prev,
					[taskId]: { id: taskId, status: "IDLE", output: [] },
				};
			});
		};

		const handleStart = (taskId: string) => {
			setTasks((prev) => ({
				...prev,
				[taskId]: {
					...prev[taskId],
					status: "RUNNING",
					startTime: Date.now(),
				},
			}));
		};

		// Shared terminal-state transition for taskSuccess / taskFail — both
		// just stamp status + endTime + duration from the recorded startTime.
		const finishTask = (taskId: string, status: "SUCCESS" | "FAILURE") => {
			setTasks((prev) => {
				const startTime = prev[taskId]?.startTime || Date.now();
				const endTime = Date.now();
				return {
					...prev,
					[taskId]: {
						...prev[taskId],
						status,
						endTime,
						duration: endTime - startTime,
					},
				};
			});
		};

		const handleSuccess = (taskId: string) => finishTask(taskId, "SUCCESS");
		const handleFail = (taskId: string) => finishTask(taskId, "FAILURE");

		const handleSkipped = (taskId: string) => {
			setTasks((prev) => ({
				...prev,
				[taskId]: { ...prev[taskId], status: "SKIPPED" },
			}));
		};

		const handleReset = (taskId: string) => {
			setTasks((prev) => ({
				...prev,
				[taskId]: {
					...prev[taskId],
					status: "IDLE",
					output: [],
					startTime: undefined,
					endTime: undefined,
					duration: undefined,
				},
			}));
		};

		const flushPending = () => {
			flushTimer.current = null;
			const pending = pendingOutput.current;
			if (pending.size === 0) return;
			pendingOutput.current = new Map();
			setTasks((prev) => {
				let next: Record<string, TaskState> | null = null;
				for (const [taskId, lines] of pending) {
					const cur = prev[taskId];
					if (!cur) continue;
					if (next === null) next = { ...prev };
					const combined = cur.output.concat(lines);
					const trimmed =
						combined.length > MAX_OUTPUT_LINES
							? combined.slice(combined.length - MAX_OUTPUT_LINES)
							: combined;
					next[taskId] = { ...cur, output: trimmed };
				}
				return next ?? prev;
			});
		};

		const handleOutput = (taskId: string, data: string) => {
			// A single chunk often contains many newline-separated lines. Split here so
			// the UI can slice by row count without each entry silently expanding into
			// N terminal rows and breaking the fixed-height log pane.
			const lines = data.split(/\r?\n/);
			const existing = pendingOutput.current.get(taskId);
			if (existing) {
				for (const line of lines) existing.push(line);
			} else {
				pendingOutput.current.set(taskId, lines);
			}
			if (flushTimer.current === null) {
				flushTimer.current = setTimeout(flushPending, FLUSH_INTERVAL_MS);
			}
		};

		executor.on("taskAdded", handleAdded);
		executor.on("taskStart", handleStart);
		executor.on("taskSuccess", handleSuccess);
		executor.on("taskFail", handleFail);
		executor.on("taskSkipped", handleSkipped);
		executor.on("taskReset", handleReset);
		executor.on("taskOutput", handleOutput);

		return () => {
			executor.off("taskAdded", handleAdded);
			executor.off("taskStart", handleStart);
			executor.off("taskSuccess", handleSuccess);
			executor.off("taskFail", handleFail);
			executor.off("taskSkipped", handleSkipped);
			executor.off("taskReset", handleReset);
			executor.off("taskOutput", handleOutput);
			if (flushTimer.current !== null) {
				clearTimeout(flushTimer.current);
				flushTimer.current = null;
			}
			pendingOutput.current.clear();
		};
	}, [executor]);

	return tasks;
};
