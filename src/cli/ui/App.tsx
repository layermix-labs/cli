import path from "node:path";
import { Box, type Key, Text, useApp, useInput } from "ink";
import type React from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Executor } from "../../core/executor.js";
import type { Task } from "../../types/config.js";
import ArgsPicker from "./ArgsPicker.js";
import Kbd from "./Kbd.js";
import Overview from "./Overview.js";
import Sidebar, { type NavItem } from "./Sidebar.js";
import TagDetail from "./TagDetail.js";
import TaskDetail from "./TaskDetail.js";
import useStdoutDimensions from "./useStdoutDimensions.js";
import { type TaskState, useTaskExecutor } from "./useTaskState.js";

const SIDEBAR_WIDTH = 30;

interface AppProps {
	executor: Executor;
	allTasks: Task[];
	tagDescriptions?: Record<string, string>;
	groupDescriptions?: Record<string, string>;
	rootDir?: string;
	// Initial CLI-driven invocation. When set, App decides on mount whether to
	// execute immediately (no args declared, or --arg was supplied) or to
	// open the picker overlay first (single task with declared args). Cleared
	// after the decision is made — interactive runs from the sidebar use the
	// regular launch() path.
	initialRun?: {
		taskIds?: string[];
		tag?: string;
		cliArgsProvided?: boolean;
	};
}

// Picker is gated on the task having declared args. Returned modes mirror
// the two run paths: "run" → scheduleTask (single task, no deps); "runWithDeps"
// → scheduleRun([id], force). Same shape as the existing onRun / onRunWithDeps
// callbacks so flow stays parallel.
type PickerMode = "run" | "runWithDeps";

interface PickerState {
	taskId: string;
	mode: PickerMode;
}

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
const SPACE_HINT: Hint = ["Space", "expand"];
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
	SPACE_HINT,
	SEARCH_HINT,
	QUIT_HINT,
];
const GROUP_HINTS: Hint[] = [
	NAV_HINT,
	ENTER_HINT,
	SPACE_HINT,
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
	else if (selectedKind === "group") hints = GROUP_HINTS;
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

// ─── App ────────────────────────────────────────────────────────────────────
const App: React.FC<AppProps> = ({
	executor,
	allTasks,
	tagDescriptions = {},
	groupDescriptions = {},
	rootDir = process.cwd(),
	initialRun,
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

	const allGroups = useMemo(() => {
		const set = new Set<string>();
		for (const t of allTasks) if (t.group) set.add(t.group);
		return Array.from(set).sort();
	}, [allTasks]);

	const tasksMap = useTaskExecutor(executor, allTaskIds);
	const [columns, rows] = useStdoutDimensions();
	const contentWidth = Math.max(20, columns - SIDEBAR_WIDTH);

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [fullscreenLogs, setFullscreenLogs] = useState(false);
	const [searchMode, setSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	// Persist which collapsibles are open across re-renders. Default-closed for
	// both groups and tags — long task runners often have many of each, so the
	// sidebar stays readable on first open.
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		() => new Set(),
	);
	const [expandedTags, setExpandedTags] = useState<Set<string>>(
		() => new Set(),
	);
	// Open args-picker overlay (null when no task is awaiting input). When set,
	// App's own input handler is suppressed and the picker captures keys.
	const [pickerState, setPickerState] = useState<PickerState | null>(null);

	const tasksById = useMemo(() => {
		const map: Record<string, Task> = {};
		for (const t of allTasks) map[t.id] = t;
		return map;
	}, [allTasks]);

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

	const tasksByGroup = useMemo(() => {
		const map: Record<string, string[]> = {};
		for (const t of allTasks) {
			if (!t.group) continue;
			if (!map[t.group]) map[t.group] = [];
			map[t.group].push(t.id);
		}
		return map;
	}, [allTasks]);

	// Case-insensitive substring match against task ids. When no query is set
	// (search closed, or `/` just opened with an empty buffer) we show every
	// task so the sidebar doesn't flash empty between keystrokes.
	const filteredTaskIds = useMemo(() => {
		if (!searchQuery) return allTaskIds;
		const q = searchQuery.toLowerCase();
		return allTaskIds.filter((id) => id.toLowerCase().includes(q));
	}, [searchQuery, allTaskIds]);

	// Tasks with no `group` show up in the main Tasks list. Grouped tasks only
	// appear under their collapsible group header.
	const ungroupedTaskIds = useMemo(
		() => filteredTaskIds.filter((id) => !tasksById[id]?.group),
		[filteredTaskIds, tasksById],
	);

	// During search, auto-expand every collapsible that contains matches so the
	// user can see *where* their query hit. Manual expansion state still wins
	// for groups/tags that have no matches (they stay as the user left them).
	const effectiveExpandedGroups = useMemo(() => {
		if (!searchQuery) return expandedGroups;
		const next = new Set(expandedGroups);
		for (const g of allGroups) {
			const members = tasksByGroup[g] ?? [];
			if (members.some((id) => filteredTaskIds.includes(id))) next.add(g);
		}
		return next;
	}, [expandedGroups, searchQuery, allGroups, tasksByGroup, filteredTaskIds]);

	const effectiveExpandedTags = useMemo(() => {
		if (!searchQuery) return expandedTags;
		const next = new Set(expandedTags);
		for (const tag of allTags) {
			const members = tasksByTag[tag] ?? [];
			if (members.some((id) => filteredTaskIds.includes(id))) next.add(tag);
		}
		return next;
	}, [expandedTags, searchQuery, allTags, tasksByTag, filteredTaskIds]);

	const navItems = useMemo<NavItem[]>(() => {
		const items: NavItem[] = [{ kind: "overview" }];

		for (const id of ungroupedTaskIds) items.push({ kind: "task", id });

		for (const g of allGroups) {
			items.push({ kind: "group", name: g });
			if (effectiveExpandedGroups.has(g)) {
				const members = (tasksByGroup[g] ?? []).filter(
					(id) => !searchQuery || filteredTaskIds.includes(id),
				);
				for (const id of members) {
					items.push({
						kind: "task",
						id,
						under: { section: "group", name: g },
					});
				}
			}
		}

		for (const tag of allTags) {
			items.push({ kind: "tag", name: tag });
			if (effectiveExpandedTags.has(tag)) {
				const members = (tasksByTag[tag] ?? []).filter(
					(id) => !searchQuery || filteredTaskIds.includes(id),
				);
				for (const id of members) {
					items.push({
						kind: "task",
						id,
						under: { section: "tag", name: tag },
					});
				}
			}
		}

		return items;
	}, [
		ungroupedTaskIds,
		allGroups,
		effectiveExpandedGroups,
		tasksByGroup,
		allTags,
		effectiveExpandedTags,
		tasksByTag,
		filteredTaskIds,
		searchQuery,
	]);

	const selected = navItems[selectedIndex] ?? navItems[0];

	// Returns a state updater that flips membership of `name` in the given
	// Set. Shared between expandedGroups / expandedTags so the two toggle
	// branches aren't a copy-paste pair.
	const toggleInSet =
		(name: string) =>
		(prev: Set<string>): Set<string> => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		};

	const toggleExpansion = (item: NavItem) => {
		if (item.kind === "group") setExpandedGroups(toggleInSet(item.name));
		else if (item.kind === "tag") setExpandedTags(toggleInSet(item.name));
	};

	// Any non-task selection automatically leaves fullscreen mode.
	useEffect(() => {
		if (selected.kind !== "task") setFullscreenLogs(false);
	}, [selected.kind]);

	// One-shot CLI-driven kickoff. Runs only on mount — the regular launch()
	// path handles every subsequent interactive run. The decision tree:
	//   • no initialRun → idle TUI (user picks tasks themselves)
	//   • single task with declared args + no --arg → open picker first so the
	//     user fills in $1..$N before the task runs (the previous behavior of
	//     calling executor.execute immediately would fail at resolveArgValues)
	//   • everything else → execute as before
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only run on first mount; later interactive runs go through launch()/scheduleRun.
	useEffect(() => {
		if (!initialRun) return;
		const { taskIds, tag, cliArgsProvided } = initialRun;
		if (!taskIds && !tag) return;

		if (!cliArgsProvided && !tag && taskIds && taskIds.length === 1) {
			const task = tasksById[taskIds[0]];
			if (task?.args && task.args.length > 0) {
				setPickerState({ taskId: taskIds[0], mode: "runWithDeps" });
				return;
			}
		}

		executor.execute(taskIds, tag);
	}, []);

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

		// Picker owns input completely while open. Bail before any other
		// handler so its sub-component's useInput is the only listener.
		if (pickerState !== null) return;

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

		// Space toggles expansion on group/tag headers. No-op on other rows.
		if (input === " ") {
			toggleExpansion(selected);
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

	// Per-kind render helpers. Splitting these out keeps `renderContentPane`
	// itself a flat 4-way dispatch — fallow flagged the inline version as
	// over-complex (every nested if/else and per-branch JSX block counted).
	const renderGroupPane = (name: string) => {
		// Groups are UI-only (no CLI, no run/retry actions) per design — so
		// the detail pane is a scoped Overview showing just the members.
		const ids = tasksByGroup[name] ?? [];
		const scoped: Record<string, TaskState> = {};
		for (const id of ids) if (tasksMap[id]) scoped[id] = tasksMap[id];
		const description = groupDescriptions[name];
		return (
			<Overview
				tasks={scoped}
				width={contentWidth}
				title={
					<Box flexDirection="column">
						<Box>
							<Text bold>Group: </Text>
							<Text color="blue" bold>
								{name}
							</Text>
							<Text dimColor>
								{" "}
								({ids.length} task{ids.length === 1 ? "" : "s"})
							</Text>
						</Box>
						{description ? (
							<Text dimColor wrap="truncate-end">
								{description}
							</Text>
						) : null}
					</Box>
				}
			/>
		);
	};

	const renderTaskPane = (id: string) => {
		const task = tasksById[id];
		const hasArgs = !!task?.args && task.args.length > 0;
		const hasDeps = !!task?.dependsOn && task.dependsOn.length > 0;
		const launch = (mode: PickerMode) => {
			if (hasArgs) {
				setPickerState({ taskId: id, mode });
				return;
			}
			if (mode === "run") executor.scheduleTask(id);
			else executor.scheduleRun([id], undefined, { force: true });
		};
		// "Rerun" replays the same args without prompting. Args were stored on
		// the executor by the picker (or the CLI --arg flag); scheduleTask
		// re-uses them directly. Visible only when hasArgs, so we never
		// dispatch this for a no-args task.
		return (
			<TaskDetail
				task={tasksMap[id] ?? idleTask(id)}
				description={task?.description}
				cmd={task?.cmd}
				width={contentWidth}
				inputLocked={searchMode || pickerState !== null}
				hasArgs={hasArgs}
				hasDeps={hasDeps}
				onRun={() => launch("run")}
				onRerun={() => executor.scheduleTask(id)}
				onRunWithDeps={() => launch("runWithDeps")}
				onRetry={() => executor.retry(id)}
				onKill={() => executor.killTask(id)}
				onClose={() => setSelectedIndex(0)}
				onToggleFullscreen={() => setFullscreenLogs(true)}
			/>
		);
	};

	const renderTagPane = (name: string) => (
		<TagDetail
			tag={name}
			description={tagDescriptions[name]}
			taskIds={tasksByTag[name] ?? []}
			tasks={tasksMap}
			width={contentWidth}
			inputLocked={searchMode}
			onRun={() => executor.scheduleRun(undefined, name, { force: true })}
			onRetryFailed={() => executor.retryFailed(tasksByTag[name])}
			onClose={() => setSelectedIndex(0)}
		/>
	);

	const renderContentPane = () => {
		if (selected.kind === "overview")
			return <Overview tasks={tasksMap} width={contentWidth} />;
		if (selected.kind === "group") return renderGroupPane(selected.name);
		if (selected.kind === "task") return renderTaskPane(selected.id);
		return renderTagPane(selected.name);
	};

	const isFullscreenTask = fullscreenLogs && selected.kind === "task";

	const handlePickerSubmit = (
		values: (string | string[] | undefined)[],
	): void => {
		if (!pickerState) return;
		const { taskId, mode } = pickerState;
		executor.setTaskArgs(taskId, values);
		if (mode === "run") executor.scheduleTask(taskId);
		else executor.scheduleRun([taskId], undefined, { force: true });
		setPickerState(null);
		// Land the cursor on the launched task so its log pane is what the user
		// sees streaming. Without this the selection stays on Overview (or
		// wherever the user was) and the just-started task is offscreen.
		const idx = navItems.findIndex(
			(it) => it.kind === "task" && it.id === taskId,
		);
		if (idx >= 0) setSelectedIndex(idx);
	};

	const pickerTask = pickerState ? tasksById[pickerState.taskId] : null;
	const pickerOverlay =
		pickerState && pickerTask?.args && pickerTask.args.length > 0 ? (
			<ArgsPicker
				taskId={pickerState.taskId}
				args={pickerTask.args}
				cwd={path.resolve(rootDir, pickerTask.cwd ?? ".")}
				width={contentWidth}
				onSubmit={handlePickerSubmit}
				onCancel={() => setPickerState(null)}
			/>
		) : null;

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
				width={SIDEBAR_WIDTH}
				navItems={navItems}
				selectedIndex={selectedIndex}
				tasksMap={tasksMap}
				expandedGroups={effectiveExpandedGroups}
				expandedTags={effectiveExpandedTags}
				searchActive={searchMode}
				searchQuery={searchQuery}
			/>
			<Box width={contentWidth} flexDirection="column" flexShrink={0}>
				{pickerOverlay ?? renderContentPane()}
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
