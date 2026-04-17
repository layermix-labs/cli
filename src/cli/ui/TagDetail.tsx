import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { FooterOptions, handleFooterNavInput } from "./FooterMenu.js";
import Overview from "./Overview.js";
import type { TaskState } from "./useTaskState.js";

interface TagDetailProps {
	tag: string;
	taskIds: string[];
	tasks: Record<string, TaskState>;
	width: number;
	description?: string;
	onRun?: () => void;
	onClose?: () => void;
}

const EMPTY_OPTIONS = ["Close"] as const;
const DEFAULT_OPTIONS = ["Run Tag", "Close"] as const;

const OPTION_KEYS: Record<string, string | undefined> = {
	"Run Tag": "r",
	Close: "x",
};

interface FooterProps {
	options: readonly string[];
	selectedOption: number;
}

const TagFooter: React.FC<FooterProps> = ({ options, selectedOption }) => (
	<Box
		borderStyle="single"
		borderColor="gray"
		borderLeft={false}
		borderRight={false}
		borderBottom={false}
		flexDirection="row"
		flexShrink={0}
	>
		<FooterOptions
			options={options}
			selectedOption={selectedOption}
			optionKeys={OPTION_KEYS}
		/>
	</Box>
);

const TagDetail: React.FC<TagDetailProps> = ({
	tag,
	taskIds,
	tasks,
	width,
	description,
	onRun,
	onClose,
}) => {
	const filteredTasks = useMemo(() => {
		const out: Record<string, TaskState> = {};
		for (const id of taskIds) {
			if (tasks[id]) out[id] = tasks[id];
		}
		return out;
	}, [taskIds, tasks]);

	const options = taskIds.length === 0 ? EMPTY_OPTIONS : DEFAULT_OPTIONS;
	const [selectedOption, setSelectedOption] = useState(0);

	// Reset menu cursor when switching between tags, or when the option set
	// flips because the tag went from empty to populated (or vice versa).
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setter is stable; reset on tag or options-reference change.
	useEffect(() => {
		setSelectedOption(0);
	}, [tag, options]);

	const activate = (choice: string | undefined) => {
		if (!choice) return;
		if (choice === "Run Tag") onRun?.();
		else if (choice === "Close") onClose?.();
	};

	useInput((input, key) => {
		// Direct shortcuts.
		if (input === "r" && taskIds.length > 0) {
			onRun?.();
			return;
		}
		if (input === "x") {
			onClose?.();
			return;
		}
		handleFooterNavInput(
			input,
			key,
			options,
			selectedOption,
			setSelectedOption,
			activate,
		);
	});

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
		<TagFooter options={options} selectedOption={selectedOption} />
	);

	if (taskIds.length === 0) {
		return (
			<Box flexDirection="column" flexGrow={1} width={width} paddingX={1}>
				{title}
				<Box marginTop={1} flexGrow={1}>
					<Text dimColor>No tasks carry this tag.</Text>
				</Box>
				{footer}
			</Box>
		);
	}

	return (
		<Overview
			tasks={filteredTasks}
			width={width}
			title={title}
			footer={footer}
		/>
	);
};

export default TagDetail;
