import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import { STATUS_COLOR, STATUS_ICON } from "./status.js";
import type { TaskState } from "./useTaskState.js";

interface TaskListProps {
	tasks: TaskState[];
	selectedTaskId: string;
	width?: number;
}

const TaskList: React.FC<TaskListProps> = ({
	tasks,
	selectedTaskId,
	width = 30,
}) => {
	return (
		<Box flexDirection="column" width={width} paddingX={1}>
			<Box marginBottom={1}>
				<Text bold>Tasks</Text>
			</Box>
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
