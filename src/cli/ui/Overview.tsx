import { Box, Text } from "ink";
import React, { useMemo } from "react";
import type { TaskState } from "./useTaskState.js";

interface OverviewProps {
	tasks: Record<string, TaskState>;
	width: number;
	title?: React.ReactNode;
	footer?: React.ReactNode;
}

const LABEL_WIDTH = 20;
const DURATION_WIDTH = 10;
const DURATION_GAP = 1;
const PADDING = 1;

const Overview: React.FC<OverviewProps> = ({ tasks, width, title, footer }) => {
	const [now, setNow] = React.useState(Date.now());

	const taskList = Object.values(tasks);
	// The waterfall + duration display only needs `now` to advance while at
	// least one task is actually running. Idle/finished states are static, so
	// gate the 100ms ticker on that — otherwise the whole pane re-renders 10×/s
	// for nothing and any expensive useMemos below thrash on each tick.
	const hasRunning = taskList.some((t) => t.status === "RUNNING");

	React.useEffect(() => {
		if (!hasRunning) return;
		const timer = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(timer);
	}, [hasRunning]);

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
		const success = taskList.filter((t) => t.status === "SUCCESS").length;
		const failure = taskList.filter((t) => t.status === "FAILURE").length;
		const running = taskList.filter((t) => t.status === "RUNNING").length;
		const skipped = taskList.filter((t) => t.status === "SKIPPED").length;
		const queued = taskList.filter((t) => t.status === "QUEUED").length;
		const pending = taskList.filter((t) => t.status === "IDLE").length;
		return { success, failure, running, skipped, queued, pending };
	}, [taskList]);

	// Waterfall — strictly bounded by the pane we were given.
	// Parent provides the outer frame, so we only reserve padding here.
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
			{title ?? (
				<Text bold underline>
					Overview
				</Text>
			)}

			{/* Waterfall fills the available space so stats block below stays pinned to the bottom. */}
			<Box marginTop={1} flexDirection="column" flexGrow={1} flexShrink={1}>
				{taskList.map((task) => (
					<Box key={task.id} minHeight={1} width={innerWidth}>
						<Box width={LABEL_WIDTH} flexShrink={0}>
							<Text wrap="truncate-end">
								{(() => {
									const name = task.label ?? task.id;
									return name.length > LABEL_WIDTH - 2
										? `${name.slice(0, LABEL_WIDTH - 4)}...`
										: name;
								})()}
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

			{/* Stats block — embedded (no outer border), just a top divider. */}
			<Box
				borderStyle="single"
				borderColor="gray"
				borderLeft={false}
				borderRight={false}
				borderBottom={false}
				flexDirection="column"
				flexShrink={0}
				width={innerWidth}
			>
				<Text>Total Duration: {(totalDuration / 1000).toFixed(2)}s</Text>
				<Box>
					<Text color="green">Success: {stats.success} </Text>
					<Text color="red">Failed: {stats.failure} </Text>
					<Text color="blue">Running: {stats.running} </Text>
					<Text color="blue">Queued: {stats.queued} </Text>
					<Text color="gray">Not Started: {stats.skipped} </Text>
					<Text color="yellow">Waiting: {stats.pending}</Text>
				</Box>
				{bottleneck?.duration && (
					<Text>
						Bottleneck: {bottleneck.label ?? bottleneck.id} (
						{(bottleneck.duration / 1000).toFixed(1)}s)
					</Text>
				)}
			</Box>

			{footer && <Box flexShrink={0}>{footer}</Box>}
		</Box>
	);
};

export default Overview;
