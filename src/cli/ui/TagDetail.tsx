import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import Overview from "./Overview.js";
import type { TaskState } from "./useTaskState.js";

interface TagDetailProps {
	tag: string;
	taskIds: string[];
	tasks: Record<string, TaskState>;
	width: number;
	description?: string;
}

const TagDetail: React.FC<TagDetailProps> = ({
	tag,
	taskIds,
	tasks,
	width,
	description,
}) => {
	const filteredTasks = useMemo(() => {
		const out: Record<string, TaskState> = {};
		for (const id of taskIds) {
			if (tasks[id]) out[id] = tasks[id];
		}
		return out;
	}, [taskIds, tasks]);

	const title = (
		<Box flexDirection="column">
			<Box>
				<Text bold>Tag: </Text>
				<Text color="magenta" bold>
					#{tag}
				</Text>
				<Text dimColor>
					{" "}
					({taskIds.length} task{taskIds.length === 1 ? "" : "s"})
				</Text>
			</Box>
			{description ? (
				<Text dimColor wrap="truncate-end">
					{description}
				</Text>
			) : null}
		</Box>
	);

	const footer = (
		<Text dimColor>
			Press <Text bold>Enter</Text> to run these tasks (with their upstream
			dependencies).
		</Text>
	);

	if (taskIds.length === 0) {
		return (
			<Box
				flexDirection="column"
				flexGrow={1}
				width={width}
				borderStyle="single"
				borderColor="magenta"
				paddingX={1}
			>
				{title}
				<Box marginTop={1}>
					<Text dimColor>No tasks carry this tag.</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Overview
			tasks={filteredTasks}
			width={width}
			title={title}
			borderColor="magenta"
			footer={footer}
		/>
	);
};

export default TagDetail;
