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

// ─── Frame helper ──────────────────────────────────────────────────────────
//
// Without an outer frame, the only divider we draw is the horizontal line
// between the top bar and the body. When the body shows the sidebar/content
// split, a `┬` sits where the sidebar's right-border column begins so the
// horizontal and vertical lines connect cleanly.
const repeat = (ch: string, n: number) => (n > 0 ? ch.repeat(n) : "");

const topBarDividerLine = (columns: number, showSidebarTee: boolean) => {
	if (!showSidebarTee) return repeat("─", columns);
	const leftRun = SIDEBAR_WIDTH - 1;
	const rightRun = columns - SIDEBAR_WIDTH;
	return `${repeat("─", leftRun)}┬${repeat("─", rightRun)}`;
};

// ─── Top bar ────────────────────────────────────────────────────────────────
interface TopBarProps {
	selectedKind: NavItem["kind"];
	fullscreenLogs: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ selectedKind, fullscreenLogs }) => (
	<Box paddingX={1} flexShrink={0}>
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
		) : selectedKind === "task" ? (
			<Text>
				<Kbd k="↑↓" />
				<Text dimColor> nav · </Text>
				<Kbd k="←→" />
				<Text dimColor> menu · </Text>
				<Kbd k="Enter" />
				<Text dimColor> select · </Text>
				<Kbd k="PgUp/Dn" />
				<Text dimColor> scroll · </Text>
				<Kbd k="f" />
				<Text dimColor> fullscreen · </Text>
				<Kbd k="q" />
				<Text dimColor> quit</Text>
			</Text>
		) : selectedKind === "tag" ? (
			<Text>
				<Kbd k="↑↓" />
				<Text dimColor> nav · </Text>
				<Kbd k="←→" />
				<Text dimColor> menu · </Text>
				<Kbd k="Enter" />
				<Text dimColor> select · </Text>
				<Kbd k="q" />
				<Text dimColor> quit</Text>
			</Text>
		) : (
			<Text>
				<Kbd k="↑↓" />
				<Text dimColor> nav · </Text>
				<Kbd k="Enter" />
				<Text dimColor> select · </Text>
				<Kbd k="q" />
				<Text dimColor> quit</Text>
			</Text>
		)}
	</Box>
);

// ─── Sidebar ────────────────────────────────────────────────────────────────
//
// One column inside the body. Draws its own `borderRight` as the vertical
// divider against the content pane. Internal sections use `borderBottom` to
// separate themselves; at their edges the lines meet the outer `│` columns
// cleanly enough for the single-line grid illusion to hold.
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
}) => {
	const innerWidth = SIDEBAR_WIDTH - 1; // minus own right-border column
	return (
		<Box
			flexDirection="column"
			width={SIDEBAR_WIDTH}
			flexShrink={0}
			borderStyle="single"
			borderColor="gray"
			borderTop={false}
			borderLeft={false}
			borderBottom={false}
		>
			<Box
				paddingX={1}
				flexShrink={0}
				borderStyle="single"
				borderColor="gray"
				borderTop={false}
				borderLeft={false}
				borderRight={false}
			>
				<Text
					color={selected.kind === "overview" ? "cyan" : undefined}
					bold={selected.kind === "overview"}
				>
					{selected.kind === "overview" ? "> " : "  "}Overview
				</Text>
			</Box>
			<Box
				flexShrink={0}
				flexDirection="column"
				borderStyle="single"
				borderColor="gray"
				borderTop={false}
				borderLeft={false}
				borderRight={false}
			>
				<TaskList
					tasks={tasksList}
					selectedTaskId={selectedTaskId}
					width={innerWidth}
				/>
			</Box>
			<Box flexShrink={0} flexDirection="column">
				<TagList tags={allTags} selectedTag={selectedTag} width={innerWidth} />
			</Box>
		</Box>
	);
};

// ─── App ────────────────────────────────────────────────────────────────────
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
	const contentWidth = Math.max(20, columns - SIDEBAR_WIDTH);

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
		// All per-view shortcuts (r, R, c, x, Enter, arrows for menu) live in
		// TaskDetail / TagDetail — App only handles the global stuff above.
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
				onRun={() =>
					executor.scheduleRun(undefined, (selected as { name: string }).name)
				}
				onClose={() => setSelectedIndex(0)}
			/>
		);
	};

	const isFullscreenTask = fullscreenLogs && selected.kind === "task";

	// Body is either the fullscreen task view or the sidebar/content split.
	// No outer frame means content extends flush to the terminal edges; the
	// only divider left is the horizontal line below the top bar.
	const bodyContent = isFullscreenTask ? (
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
			<TopBar selectedKind={selected.kind} fullscreenLogs={fullscreenLogs} />
			<Text color="blue">{topBarDividerLine(columns, !isFullscreenTask)}</Text>
			{bodyContent}
		</Box>
	);
};

export default App;
