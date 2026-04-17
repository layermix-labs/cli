import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { Executor } from "../../core/executor.js";
import type { Task } from "../../types/config.js";
import Kbd from "./Kbd.js";
import Overview from "./Overview.js";
import TagDetail from "./TagDetail.js";
import TagList from "./TagList.js";
import TaskDetail from "./TaskDetail.js";
import TaskList from "./TaskList.js";
import useStdoutDimensions from "./useStdoutDimensions.js";
import { type TaskState, useTaskExecutor } from "./useTaskState.js";

const SIDEBAR_WIDTH = 30;
const SIDEBAR_GAP = 1;

interface AppProps {
	executor: Executor;
	allTasks: Task[];
	tagDescriptions?: Record<string, string>;
}

type NavItem =
	| { kind: "overview" }
	| { kind: "task"; id: string }
	| { kind: "tag"; name: string };

const idleTask = (id: string): TaskState => ({
	id,
	status: "IDLE",
	output: [],
});

interface TopBarProps {
	columns: number;
	fullscreenLogs: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ columns, fullscreenLogs }) => (
	<Box
		borderStyle="single"
		borderColor="blue"
		paddingX={1}
		width={columns}
		flexShrink={0}
	>
		<Text bold>LayerMix TUI</Text>
		<Text> | </Text>
		{fullscreenLogs ? (
			<Text>
				<Text dimColor>Logs fullscreen — </Text>
				<Kbd k="PgUp/Dn" />
				<Text dimColor> scroll · </Text>
				<Kbd k="g/G" />
				<Text dimColor> top/tail · </Text>
				<Kbd k="f" />
				<Text dimColor>/</Text>
				<Kbd k="Esc" />
				<Text dimColor> exit</Text>
			</Text>
		) : (
			<Text>
				<Kbd k="↑↓" />
				<Text dimColor> nav · </Text>
				<Kbd k="q" />
				<Text dimColor> quit</Text>
			</Text>
		)}
	</Box>
);

interface SidebarProps {
	selected: NavItem;
	tasksList: TaskState[];
	selectedTaskId: string;
	allTags: string[];
	selectedTag: string;
}

const Sidebar: React.FC<SidebarProps> = ({
	selected,
	tasksList,
	selectedTaskId,
	allTags,
	selectedTag,
}) => (
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
		<TagList tags={allTags} selectedTag={selectedTag} width={SIDEBAR_WIDTH} />
	</Box>
);

const App: React.FC<AppProps> = ({
	executor,
	allTasks,
	tagDescriptions = {},
}) => {
	const { exit } = useApp();

	const allTaskIds = useMemo(() => allTasks.map((t) => t.id), [allTasks]);

	const allTags = useMemo(() => {
		const set = new Set<string>();
		for (const t of allTasks) {
			for (const tag of t.tags) set.add(tag);
		}
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
	const [fullscreenLogs, setFullscreenLogs] = useState(false);

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
		for (const t of allTasks) {
			for (const tag of t.tags) {
				if (!map[tag]) map[tag] = [];
				map[tag].push(t.id);
			}
		}
		return map;
	}, [allTasks]);

	const tasksById = useMemo(() => {
		const map: Record<string, Task> = {};
		for (const t of allTasks) map[t.id] = t;
		return map;
	}, [allTasks]);

	// Any non-task selection automatically leaves fullscreen mode.
	useEffect(() => {
		if (selected.kind !== "task") setFullscreenLogs(false);
	}, [selected.kind]);

	const quit = () => {
		exit();
		process.exit(0);
	};

	useInput((input, key) => {
		if (input === "c" && key.ctrl) quit();
		if (key.escape) {
			if (fullscreenLogs) {
				setFullscreenLogs(false);
				return;
			}
			quit();
		}

		// Sidebar nav is disabled while fullscreen so scroll keys don't shift
		// the task selection.
		if (fullscreenLogs) return;

		// Global quit. TaskDetail owns `q` while fullscreen (exits fullscreen),
		// so we only reach here outside that mode thanks to the guard above.
		if (input === "q") {
			quit();
			return;
		}

		if (key.upArrow || input === "k") {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navItems.length - 1));
			return;
		}
		if (key.downArrow || input === "j") {
			setSelectedIndex((prev) => (prev < navItems.length - 1 ? prev + 1 : 0));
			return;
		}
		// Enter or `r` schedules a tag. Task shortcuts live in TaskDetail.
		if ((key.return || input === "r") && selected.kind === "tag") {
			executor.scheduleRun(undefined, selected.name);
		}
	});

	const selectedTaskId = selected.kind === "task" ? selected.id : "";
	const selectedTag = selected.kind === "tag" ? selected.name : "";

	const renderContentPane = () => {
		if (selected.kind === "overview") {
			return <Overview tasks={tasksMap} width={contentWidth} />;
		}
		if (selected.kind === "task") {
			return (
				<TaskDetail
					task={tasksMap[selected.id] ?? idleTask(selected.id)}
					description={tasksById[selected.id]?.description}
					cmd={tasksById[selected.id]?.cmd}
					width={contentWidth}
					onRun={() => executor.scheduleTask(selected.id)}
					onRunWithDeps={() => executor.scheduleRun([selected.id])}
					onRetry={() => executor.retry(selected.id)}
					onKill={() => executor.killTask(selected.id)}
					onClose={() => setSelectedIndex(0)}
					onToggleFullscreen={() => setFullscreenLogs(true)}
				/>
			);
		}
		return (
			<TagDetail
				tag={selected.name}
				description={tagDescriptions[selected.name]}
				taskIds={tasksByTag[selected.name] ?? []}
				tasks={tasksMap}
				width={contentWidth}
			/>
		);
	};

	const body =
		fullscreenLogs && selected.kind === "task" ? (
			<TaskDetail
				task={tasksMap[selected.id] ?? idleTask(selected.id)}
				description={tasksById[selected.id]?.description}
				cmd={tasksById[selected.id]?.cmd}
				width={columns}
				fullscreen
				onToggleFullscreen={() => setFullscreenLogs(false)}
			/>
		) : (
			<Box flexDirection="row" flexGrow={1}>
				<Sidebar
					selected={selected}
					tasksList={tasksList}
					selectedTaskId={selectedTaskId}
					allTags={allTags}
					selectedTag={selectedTag}
				/>
				<Box width={contentWidth} flexDirection="column" flexShrink={0}>
					{renderContentPane()}
				</Box>
			</Box>
		);

	return (
		<Box flexDirection="column" width={columns} height={rows}>
			<TopBar columns={columns} fullscreenLogs={fullscreenLogs} />
			{body}
		</Box>
	);
};

export default App;
