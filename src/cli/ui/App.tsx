import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useMemo, useState } from "react";
import type { Executor } from "../../core/executor.js";
import type { Task } from "../../types/config.js";
import Overview from "./Overview.js";
import TagDetail from "./TagDetail.js";
import TagList from "./TagList.js";
import TaskDetail from "./TaskDetail.js";
import TaskList from "./TaskList.js";
import useStdoutDimensions from "./useStdoutDimensions.js";
import { useTaskExecutor } from "./useTaskState.js";

const SIDEBAR_WIDTH = 30;
const SIDEBAR_GAP = 1;

interface AppProps {
	executor: Executor;
	allTasks: Task[];
}

type NavItem =
	| { kind: "overview" }
	| { kind: "task"; id: string }
	| { kind: "tag"; name: string };

const App: React.FC<AppProps> = ({ executor, allTasks }) => {
	const { exit } = useApp();

	const allTaskIds = useMemo(() => allTasks.map((t) => t.id), [allTasks]);

	const allTags = useMemo(() => {
		const set = new Set<string>();
		allTasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
		return Array.from(set).sort();
	}, [allTasks]);

	const tasksMap = useTaskExecutor(executor, allTaskIds);
	const [columns, rows] = useStdoutDimensions();
	const contentWidth = Math.max(20, columns - SIDEBAR_WIDTH - SIDEBAR_GAP);

	const navItems = useMemo<NavItem[]>(
		() => [
			{ kind: "overview" },
			...allTaskIds.map<NavItem>((id) => ({ kind: "task", id })),
			...allTags.map<NavItem>((name) => ({ kind: "tag", name })),
		],
		[allTaskIds, allTags],
	);

	const [selectedIndex, setSelectedIndex] = useState(0);

	const tasksList = useMemo(
		() =>
			allTaskIds.map(
				(id) => tasksMap[id] ?? { id, status: "IDLE" as const, output: [] },
			),
		[allTaskIds, tasksMap],
	);

	const selected = navItems[selectedIndex] ?? navItems[0];

	const tasksByTag = useMemo(() => {
		const map: Record<string, string[]> = {};
		allTasks.forEach((t) => {
			t.tags.forEach((tag) => {
				(map[tag] = map[tag] || []).push(t.id);
			});
		});
		return map;
	}, [allTasks]);

	useInput((input, key) => {
		if (key.escape || (input === "c" && key.ctrl)) {
			exit();
			process.exit(0);
		}

		if (key.upArrow || input === "k") {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navItems.length - 1));
			return;
		}

		if (key.downArrow || input === "j") {
			setSelectedIndex((prev) => (prev < navItems.length - 1 ? prev + 1 : 0));
			return;
		}

		if (key.return) {
			// Tag pane handles its own Enter here; task pane's TaskDetail has its own menu.
			if (selected.kind === "tag") {
				executor.scheduleRun(undefined, selected.name);
			}
		}
	});

	const selectedTaskId = selected.kind === "task" ? selected.id : "";
	const selectedTag = selected.kind === "tag" ? selected.name : "";

	return (
		<Box flexDirection="column" width={columns} height={rows}>
			<Box
				borderStyle="single"
				borderColor="blue"
				paddingX={1}
				width={columns}
				flexShrink={0}
			>
				<Text bold>My-Runner TUI</Text>
				<Text> | </Text>
				<Text>Nav: Arrows/hjkl | Run: Enter | Quit: Ctrl+C</Text>
			</Box>

			<Box flexDirection="row" flexGrow={1}>
				{/* Sidebar */}
				<Box
					flexDirection="column"
					marginRight={SIDEBAR_GAP}
					width={SIDEBAR_WIDTH}
					flexShrink={0}
				>
					<Box
						borderStyle="single"
						borderColor="gray"
						marginBottom={0}
						width={SIDEBAR_WIDTH}
					>
						<Text
							color={selected.kind === "overview" ? "cyan" : undefined}
							bold={selected.kind === "overview"}
						>
							{selected.kind === "overview" ? "> " : "  "}Overview
						</Text>
					</Box>
					<TaskList
						tasks={tasksList}
						selectedTaskId={selectedTaskId}
						width={SIDEBAR_WIDTH}
					/>
					<TagList
						tags={allTags}
						selectedTag={selectedTag}
						width={SIDEBAR_WIDTH}
					/>
				</Box>

				{/* Content */}
				<Box width={contentWidth} flexDirection="column" flexShrink={0}>
					{selected.kind === "overview" && (
						<Overview tasks={tasksMap} width={contentWidth} />
					)}
					{selected.kind === "task" && (
						<TaskDetail
							task={
								tasksMap[selected.id] ?? {
									id: selected.id,
									status: "IDLE",
									output: [],
								}
							}
							width={contentWidth}
							onRun={() => executor.scheduleRun([selected.id])}
							onRetry={() => executor.retry(selected.id)}
							onClose={() => setSelectedIndex(0)}
						/>
					)}
					{selected.kind === "tag" && (
						<TagDetail
							tag={selected.name}
							taskIds={tasksByTag[selected.name] ?? []}
							tasks={tasksMap}
							width={contentWidth}
						/>
					)}
				</Box>
			</Box>
		</Box>
	);
};

export default App;
