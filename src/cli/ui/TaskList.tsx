import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import { STATUS_COLOR, STATUS_ICON } from "./status.js";
import type { TaskState } from "./useTaskState.js";

interface TaskListProps {
	tasks: TaskState[];
	selectedTaskId: string;
	width?: number;
	searchActive?: boolean;
	searchQuery?: string;
}

const TaskList: React.FC<TaskListProps> = ({
	tasks,
	selectedTaskId,
	width = 30,
	searchActive = false,
	searchQuery = "",
}) => {
	return (
		<Box flexDirection="column" width={width} paddingX={1}>
			<Box marginBottom={1}>
				{searchActive ? (
					<Text color="cyan" wrap="truncate-end">
						/{searchQuery}
						<Text bold>▌</Text>
					</Text>
				) : (
					<Text bold>Tasks</Text>
				)}
			</Box>
			{searchActive && tasks.length === 0 && (
				<Text dimColor> (no matches)</Text>
			)}
			{tasks.map((task) => {
				const isSelected = task.id === selectedTaskId;
				const color = STATUS_COLOR[task.status];
				const icon = STATUS_ICON[task.status];

				return (
					<Box key={task.id}>
						<Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
							{isSelected ? "> " : "  "}
						</Text>
						<Text color={color} wrap="truncate-end">
							{task.status === "RUNNING" ? <Spinner type="dots" /> : icon}{" "}
							{task.id}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
};

export default TaskList;
