import { useEffect, useState } from "react";
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

export const useTaskExecutor = (executor: Executor, knownTaskIds: string[]) => {
	const [tasks, setTasks] = useState<Record<string, TaskState>>(() => {
		const initial: Record<string, TaskState> = {};
		knownTaskIds.forEach((id) => {
			initial[id] = { id, status: "IDLE", output: [] };
		});
		return initial;
	});

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

		const handleSuccess = (taskId: string) => {
			setTasks((prev) => {
				const startTime = prev[taskId]?.startTime || Date.now();
				const endTime = Date.now();
				return {
					...prev,
					[taskId]: {
						...prev[taskId],
						status: "SUCCESS",
						endTime,
						duration: endTime - startTime,
					},
				};
			});
		};

		const handleFail = (taskId: string) => {
			setTasks((prev) => {
				const startTime = prev[taskId]?.startTime || Date.now();
				const endTime = Date.now();
				return {
					...prev,
					[taskId]: {
						...prev[taskId],
						status: "FAILURE",
						endTime,
						duration: endTime - startTime,
					},
				};
			});
		};

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

		const handleOutput = (taskId: string, data: string) => {
			setTasks((prev) => {
				const currentTask = prev[taskId];
				if (!currentTask) return prev;

				return {
					...prev,
					[taskId]: {
						...currentTask,
						output: [...currentTask.output, data],
					},
				};
			});
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
		};
	}, [executor]);

	return tasks;
};
