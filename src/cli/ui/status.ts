import type { TaskStatus } from "../../core/task-runner.js";

export const STATUS_LABEL: Record<TaskStatus, string> = {
	IDLE: "Waiting",
	QUEUED: "Queued",
	RUNNING: "Running",
	SUCCESS: "Success",
	FAILURE: "Failed",
	SKIPPED: "Not Started",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
	IDLE: "yellow",
	QUEUED: "blue",
	RUNNING: "blue",
	SUCCESS: "green",
	FAILURE: "red",
	SKIPPED: "gray",
};

export const STATUS_ICON: Record<TaskStatus, string> = {
	IDLE: "○",
	QUEUED: "●",
	RUNNING: "•",
	SUCCESS: "✓",
	FAILURE: "✗",
	SKIPPED: "-",
};
