import { Box, Text } from "ink";
import React, { useMemo } from "react";
import type { TaskState } from "./useTaskState.js";

interface OverviewProps {
	tasks: Record<string, TaskState>;
	width: number;
}

const LABEL_WIDTH = 20;
const DURATION_WIDTH = 10;
const DURATION_GAP = 1;
const PADDING = 1;

const Overview: React.FC<OverviewProps> = ({ tasks, width }) => {
	const [now, setNow] = React.useState(Date.now());

	React.useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 100); // 100ms for smoother updates
		return () => clearInterval(timer);
	}, []);

	const taskList = Object.values(tasks);

	// Calculate stats
	const totalDuration = useMemo(() => {
		const starts = taskList
			.map((t) => t.startTime)
			.filter((t): t is number => t !== undefined);
		const ends = taskList.map(
			(t) => t.endTime || (t.status === "RUNNING" ? now : t.startTime),
		);

		if (starts.length === 0) return 0;
		const minStart = Math.min(...starts);

		const validEnds = ends.filter((t): t is number => t !== undefined);
		if (validEnds.length === 0) return 0;
		const maxEnd = Math.max(...validEnds);

		return maxEnd - minStart;
	}, [taskList, now]);

	const stats = useMemo(() => {
		// ... same
		const success = taskList.filter((t) => t.status === "SUCCESS").length;
		const failure = taskList.filter((t) => t.status === "FAILURE").length;
		const running = taskList.filter((t) => t.status === "RUNNING").length;
		const skipped = taskList.filter((t) => t.status === "SKIPPED").length;
		const pending = taskList.filter(
			(t) => t.status === "IDLE" || t.status === "QUEUED",
		).length;
		return { success, failure, running, skipped, pending };
	}, [taskList]);

	// Waterfall — strictly bounded by the pane we were given.
	// Inside the pane: padding (both sides) + label + chart + gap + duration must fit.
	const innerWidth = Math.max(0, width - PADDING * 2);
	const chartWidth = Math.max(
		5,
		innerWidth - LABEL_WIDTH - DURATION_GAP - DURATION_WIDTH,
	);

	const minStart = useMemo(() => {
		const starts = taskList
			.map((t) => t.startTime)
			.filter((t): t is number => t !== undefined);
		return starts.length > 0 ? Math.min(...starts) : now;
	}, [taskList, now]);

	const maxEnd = useMemo(() => {
		const ends = taskList.map(
			(t) => t.endTime || (t.status === "RUNNING" ? now : t.startTime),
		);
		const validEnds = ends.filter((t): t is number => t !== undefined);
		return validEnds.length > 0 ? Math.max(...validEnds) : minStart + 1000;
	}, [taskList, minStart, now]);

	const scale = maxEnd - minStart || 1;

	const renderBar = (task: TaskState) => {
		if (!task.startTime) return <Text color="gray">Waiting...</Text>;

		const start = task.startTime;
		const end = task.endTime || (task.status === "RUNNING" ? now : start);

		const offsetPct = Math.max(0, (start - minStart) / scale);
		const widthPct = Math.max(0, (end - start) / scale);

		// Clamp offset so a later marginLeft can never push past the chart box.
		const offsetChars = Math.min(
			chartWidth - 1,
			Math.max(0, Math.floor(offsetPct * chartWidth)),
		);
		let widthChars = Math.max(1, Math.ceil(widthPct * chartWidth));
		if (offsetChars + widthChars > chartWidth) {
			widthChars = Math.max(1, chartWidth - offsetChars);
		}

		let color = "gray";
		if (task.status === "SUCCESS") color = "green";
		if (task.status === "FAILURE") color = "red";
		if (task.status === "RUNNING") color = "blue";
		if (task.status === "SKIPPED") color = "yellow";

		const bar = "█".repeat(widthChars);

		return (
			<Box marginLeft={offsetChars}>
				<Text color={color}>{bar}</Text>
			</Box>
		);
	};

	const bottleneck = useMemo(() => {
		const sorted = [...taskList].sort(
			(a, b) => (b.duration || 0) - (a.duration || 0),
		);
		return sorted[0];
	}, [taskList]);

	return (
		<Box flexDirection="column" paddingX={PADDING} flexGrow={1} width={width}>
			<Text bold underline>
				Overview
			</Text>

			<Box marginTop={1} flexDirection="column">
				{taskList.map((task) => (
					<Box key={task.id} minHeight={1} width={innerWidth}>
						<Box width={LABEL_WIDTH} flexShrink={0}>
							<Text wrap="truncate-end">
								{task.id.length > LABEL_WIDTH - 2
									? `${task.id.slice(0, LABEL_WIDTH - 4)}...`
									: task.id}
							</Text>
						</Box>
						<Box width={chartWidth} flexShrink={0} overflowX="hidden">
							{renderBar(task)}
						</Box>
						<Box
							width={DURATION_WIDTH}
							marginLeft={DURATION_GAP}
							flexShrink={0}
						>
							<Text dimColor wrap="truncate-end">
								{task.duration
									? `${(task.duration / 1000).toFixed(1)}s`
									: task.status === "RUNNING"
										? "..."
										: "-"}
							</Text>
						</Box>
					</Box>
				))}
			</Box>

			<Box
				marginTop={1}
				borderStyle="single"
				borderColor="gray"
				flexDirection="column"
				width={innerWidth}
			>
				<Text>Total Duration: {(totalDuration / 1000).toFixed(2)}s</Text>
				<Box>
					<Text color="green">Success: {stats.success} </Text>
					<Text color="red">Failed: {stats.failure} </Text>
					<Text color="blue">Running: {stats.running} </Text>
					<Text color="gray">Not Started: {stats.skipped} </Text>
					<Text color="yellow">Waiting: {stats.pending}</Text>
				</Box>
				{bottleneck?.duration && (
					<Text>
						Bottleneck: {bottleneck.id} (
						{(bottleneck.duration / 1000).toFixed(1)}s)
					</Text>
				)}
			</Box>
		</Box>
	);
};

export default Overview;
