import { Box, type Key, Text, useApp, useInput } from "ink";
import type React from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
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
// The legend is built from an array so the TaskDetail / TagDetail / Overview
// variants don't each duplicate the same "nav · select · search · quit" chain
// of <Kbd> + <Text dimColor> fragments.
type Hint = [string, string];

const HintList: React.FC<{ hints: Hint[] }> = ({ hints }) => (
	<>
		{hints.map(([k, label], i) => (
			<Fragment key={k}>
				<Kbd k={k} />
				<Text dimColor>{` ${label}${i < hints.length - 1 ? " · " : ""}`}</Text>
			</Fragment>
		))}
	</>
);

const NAV_HINT: Hint = ["↑↓", "nav"];
const MENU_HINT: Hint = ["←→", "menu"];
const ENTER_HINT: Hint = ["Enter", "select"];
const SEARCH_HINT: Hint = ["/", "search"];
const QUIT_HINT: Hint = ["q", "quit"];

const TASK_HINTS: Hint[] = [
	NAV_HINT,
	MENU_HINT,
	ENTER_HINT,
	SEARCH_HINT,
	["f", "fullscreen"],
	QUIT_HINT,
];
const TAG_HINTS: Hint[] = [
	NAV_HINT,
	MENU_HINT,
	ENTER_HINT,
	SEARCH_HINT,
	QUIT_HINT,
];
const OVERVIEW_HINTS: Hint[] = [NAV_HINT, ENTER_HINT, SEARCH_HINT, QUIT_HINT];

interface TopBarProps {
	selectedKind: NavItem["kind"];
	fullscreenLogs: boolean;
	searchMode: boolean;
	searchQuery: string;
}

const TopBar: React.FC<TopBarProps> = ({
	selectedKind,
	fullscreenLogs,
	searchMode,
	searchQuery,
}) => {
	let hints: Hint[];
	if (selectedKind === "task") hints = TASK_HINTS;
	else if (selectedKind === "tag") hints = TAG_HINTS;
	else hints = OVERVIEW_HINTS;

	return (
		<Box paddingX={1} flexShrink={0}>
			<Text bold>LayerMix TUI</Text>
			<Text> | </Text>
			{searchMode ? (
				<Text>
					<Text color="cyan">Search: /{searchQuery}</Text>
					<Text color="cyan" bold>
						▌
					</Text>
					<Text dimColor> · </Text>
					<HintList
						hints={[NAV_HINT, ["Enter", "confirm"], ["Esc", "cancel"]]}
					/>
				</Text>
			) : fullscreenLogs ? (
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
					<HintList hints={hints} />
				</Text>
			)}
		</Box>
	);
};

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
	searchMode: boolean;
	searchQuery: string;
}

const Sidebar: React.FC<SidebarProps> = ({
	selected,
	tasksList,
	selectedTaskId,
	allTags,
	selectedTag,
	searchMode,
	searchQuery,
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
					searchActive={searchMode}
					searchQuery={searchQuery}
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

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [fullscreenLogs, setFullscreenLogs] = useState(false);
	const [searchMode, setSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Case-insensitive substring match against task ids. When no query is set
	// (search closed, or `/` just opened with an empty buffer) we show every
	// task so the sidebar doesn't flash empty between keystrokes.
	const filteredTaskIds = useMemo(() => {
		if (!searchQuery) return allTaskIds;
		const q = searchQuery.toLowerCase();
		return allTaskIds.filter((id) => id.toLowerCase().includes(q));
	}, [searchQuery, allTaskIds]);

	const navItems = useMemo<NavItem[]>(
		() => [
			{ kind: "overview" },
			...filteredTaskIds.map<NavItem>((id) => ({ kind: "task", id })),
			...allTags.map<NavItem>((name) => ({ kind: "tag", name })),
		],
		[filteredTaskIds, allTags],
	);

	const tasksList = useMemo(
		() =>
			filteredTaskIds.map(
				(id) => tasksMap[id] ?? { id, status: "IDLE" as const, output: [] },
			),
		[filteredTaskIds, tasksMap],
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

	// Every keystroke that changes the query re-anchors selection to the first
	// match. Without this the cursor would stay on wherever it was before the
	// filter shrank, which means the highlighted row often isn't even visible.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on query so typing jumps to first match; ignoring filteredTaskIds/setSelectedIndex avoids extra resets when tasksMap updates.
	useEffect(() => {
		if (!searchMode) return;
		setSelectedIndex(filteredTaskIds.length > 0 ? 1 : 0);
	}, [searchQuery, searchMode]);

	const quit = () => {
		exit();
		process.exit(0);
	};

	const moveSelection = (delta: 1 | -1) => {
		setSelectedIndex((prev) => {
			const next = prev + delta;
			if (next < 0) return navItems.length - 1;
			if (next >= navItems.length) return 0;
			return next;
		});
	};

	// Search mode owns the input stream — every printable character feeds the
	// query rather than triggering shortcuts. Only Esc / Enter / Backspace
	// and arrows escape out. Returns true when the key was consumed so the
	// main handler can bail.
	const handleSearchInput = (input: string, key: Key): boolean => {
		if (key.escape) {
			setSearchMode(false);
			setSearchQuery("");
			return true;
		}
		if (key.return) {
			setSearchMode(false);
			return true;
		}
		if (key.backspace || key.delete) {
			setSearchQuery((q) => q.slice(0, -1));
			return true;
		}
		if (key.upArrow) {
			moveSelection(-1);
			return true;
		}
		if (key.downArrow) {
			moveSelection(1);
			return true;
		}
		if (input && !key.ctrl && !key.meta) {
			setSearchQuery((q) => q + input);
		}
		return true;
	};

	useInput((input, key) => {
		if (input === "c" && key.ctrl) quit();

		if (searchMode) {
			handleSearchInput(input, key);
			return;
		}

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

		if (input === "/") {
			setSearchMode(true);
			setSearchQuery("");
			return;
		}

		// Global quit. TaskDetail owns `q` while fullscreen (exits fullscreen),
		// so we only reach here outside that mode thanks to the guard above.
		if (input === "q") {
			quit();
			return;
		}

		if (key.upArrow || input === "k") {
			moveSelection(-1);
			return;
		}
		if (key.downArrow || input === "j") {
			moveSelection(1);
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
					inputLocked={searchMode}
					onRun={() => executor.scheduleTask(selected.id)}
					onRunWithDeps={() =>
						executor.scheduleRun([selected.id], undefined, { force: true })
					}
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
				inputLocked={searchMode}
				onRun={() =>
					executor.scheduleRun(undefined, (selected as { name: string }).name, {
						force: true,
					})
				}
				onRetryFailed={() =>
					executor.retryFailed(tasksByTag[(selected as { name: string }).name])
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
				searchMode={searchMode}
				searchQuery={searchQuery}
			/>
			<Box width={contentWidth} flexDirection="column" flexShrink={0}>
				{renderContentPane()}
			</Box>
		</Box>
	);

	return (
		<Box flexDirection="column" width={columns} height={rows}>
			<TopBar
				selectedKind={selected.kind}
				fullscreenLogs={fullscreenLogs}
				searchMode={searchMode}
				searchQuery={searchQuery}
			/>
			<Text color="blue">{topBarDividerLine(columns, !isFullscreenTask)}</Text>
			{bodyContent}
		</Box>
	);
};

export default App;
