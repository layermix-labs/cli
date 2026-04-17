import { Box, Text } from "ink";
import type React from "react";
import type { TaskStatus } from "../../core/task-runner.js";
import { STATUS_COLOR, STATUS_ICON, STATUS_LABEL } from "./status.js";
import type { TaskState } from "./useTaskState.js";

interface TagDetailProps {
	tag: string;
	taskIds: string[];
	tasks: Record<string, TaskState>;
	width: number;
}

const TagDetail: React.FC<TagDetailProps> = ({
	tag,
	taskIds,
	tasks,
	width,
}) => {
	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			width={width}
			borderStyle="single"
			borderColor="magenta"
			paddingX={1}
		>
			<Box marginBottom={1}>
				<Text bold>Tag: </Text>
				<Text color="magenta">#{tag}</Text>
				<Text dimColor>
					{" "}
					({taskIds.length} task{taskIds.length === 1 ? "" : "s"})
				</Text>
			</Box>

			<Box flexDirection="column" flexGrow={1}>
				{taskIds.length === 0 && <Text dimColor>No tasks carry this tag.</Text>}
				{taskIds.map((id) => {
					const t = tasks[id];
					const status: TaskStatus = t?.status ?? "IDLE";
					return (
						<Box key={id}>
							<Text color={STATUS_COLOR[status]}>{STATUS_ICON[status]} </Text>
							<Text wrap="truncate-end">{id}</Text>
							<Text dimColor> [{STATUS_LABEL[status]}]</Text>
						</Box>
					);
				})}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Press </Text>
				<Text bold>Enter</Text>
				<Text dimColor>
					{" "}
					to run these tasks (with their upstream dependencies).
				</Text>
			</Box>
		</Box>
	);
};

export default TagDetail;
