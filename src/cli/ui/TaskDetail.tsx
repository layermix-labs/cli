import ansiRegex from "ansi-regex";
import clipboardy from "clipboardy";
import { Box, type Key, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { FooterOptions, handleFooterNavInput } from "./FooterMenu.js";
import { STATUS_COLOR, STATUS_LABEL } from "./status.js";
import { useMouseWheel } from "./useMouseWheel.js";
import useStdoutDimensions from "./useStdoutDimensions.js";
import type { TaskState } from "./useTaskState.js";

interface TaskDetailProps {
	task: TaskState;
	width: number;
	description?: string;
	cmd?: string;
	fullscreen?: boolean;
	// When true, App is in search mode — this pane must stop consuming input
	// so typed characters build the query instead of triggering shortcuts
	// like `r` (Run) or `c` (Copy Logs).
	inputLocked?: boolean;
	// True when the task declares positional `args`. Adds extra menu options:
	// "Rerun" on success (use last collected args, no picker), and "Run" on
	// failure (re-open picker so the user can change args). Tasks without
	// args don't need either — Run = Rerun, and Retry already replays.
	hasArgs?: boolean;
	// True when the task declares any `dependsOn`. Hides "Run With Deps" when
	// false — without deps it's a duplicate of "Run".
	hasDeps?: boolean;
	onRun?: () => void;
	onRerun?: () => void;
	onRunWithDeps?: () => void;
	onRetry?: () => void;
	onKill?: () => void;
	onClose?: () => void;
	onToggleFullscreen?: () => void;
}

const FAILURE_OPTIONS = [
	"Retry",
	"Run With Deps",
	"Copy Logs",
	"Close",
] as const;
// Failure menu when the task has args: extra "Run" lets the user re-pick
// args (Retry replays the last set silently).
const FAILURE_WITH_ARGS_OPTIONS = [
	"Retry",
	"Run",
	"Run With Deps",
	"Copy Logs",
	"Close",
] as const;
const RUNNING_OPTIONS = ["Kill", "Copy Logs", "Close"] as const;
const DEFAULT_OPTIONS = ["Run", "Run With Deps", "Copy Logs", "Close"] as const;
// Success menu when the task has args: "Rerun" replays last args (the common
// case after a green run when iterating on the same input), "Run" re-opens
// the picker for a fresh selection. Rerun comes first so Enter on the
// default-highlighted option does the expected thing.
const SUCCESS_WITH_ARGS_OPTIONS = [
	"Rerun",
	"Run",
	"Run With Deps",
	"Copy Logs",
	"Close",
] as const;

// Sanitize a captured log line for safe rendering inside Ink.
//
// Tools like `biome`, `eslint --fix`, `tsc --watch`, and most modern CLIs emit
// ANSI cursor-movement / clear-line / private-mode / OSC hyperlink / charset-select
// sequences. When Ink writes those through <Text>, they execute in the host
// terminal and pull the cursor out of Ink's managed box — that's what wrecks
// the log pane for chatty tasks while plain-text tools look fine.
//
// Strategy: match every ANSI escape with `ansi-regex` (it's spec-accurate for
// CSI / OSC / DCS / charset / hyperlinks / private-mode / extended color),
// then keep only SGR escapes (final byte `m`, e.g. `\x1b[31m`, `\x1b[38;2;…m`).
// Everything else is replaced with empty string. Also strip bare cursor-control
// C0 chars (`\r`, `\b`, VT, FF) that would move the cursor.
//
// Tabs need special handling: `string-width` reports `\t` as 0 columns, but
// terminals render each tab as ~8 columns. Ink uses string-width for
// `wrap="truncate-end"`, so a tab-indented line (biome/eslint echo code
// snippets with tabs) looks narrow to Ink, isn't truncated, then renders wider
// than the pane — spilling past the sidebar and wrecking the whole layout.
// Expand tabs to spaces so measured width matches rendered width.
const ANSI = ansiRegex();
// RegExp constructors — the literal form holds raw C0 control bytes which
// biome's noControlCharactersInRegex rejects. Constructor form is the escape
// hatch, so silence the partner rule that prefers literals.
// biome-ignore-start lint/complexity/useRegexLiterals: see comment above.
const SGR_ONLY = new RegExp("^\\u001b\\[[\\d;:?]*m$");
const CURSOR_CTRL = new RegExp("[\\r\\n\\u0008\\u000b\\u000c]", "g");
// biome-ignore-end lint/complexity/useRegexLiterals: see comment above.
const TAB_REPLACEMENT = "  ";

export const sanitizeLine = (s: string) =>
	s
		.replace(ANSI, (match) => (SGR_ONLY.test(match) ? match : ""))
		.replace(CURSOR_CTRL, "")
		.replace(/\t/g, TAB_REPLACEMENT);

interface HeaderProps {
	taskId: string;
	statusLabel: string;
	statusColor: string;
	description?: string;
	cmd?: string;
	scrollHint: string;
	deemphasizeId: boolean;
}

const DetailHeader: React.FC<HeaderProps> = ({
	taskId,
	statusLabel,
	statusColor,
	description,
	cmd,
	scrollHint,
	deemphasizeId,
}) => (
	<Box
		marginBottom={1}
		borderStyle="single"
		borderTop={false}
		borderLeft={false}
		borderRight={false}
		borderColor="gray"
		flexDirection="column"
		flexShrink={0}
	>
		<Box flexShrink={0}>
			{deemphasizeId ? (
				<>
					<Text color={statusColor}>[{statusLabel}]</Text>
					<Text dimColor> {taskId}</Text>
				</>
			) : (
				<>
					<Text bold>Task: {taskId} </Text>
					<Text color={statusColor}>[{statusLabel}]</Text>
				</>
			)}
			{scrollHint ? <Text dimColor>{scrollHint}</Text> : null}
		</Box>
		{cmd ? (
			<Text wrap="truncate-end" dimColor>
				{`$ ${cmd}`}
			</Text>
		) : null}
		{description ? <Text bold>{description}</Text> : null}
	</Box>
);

interface LogPaneProps {
	innerWidth: number;
	availableHeight: number;
	visibleOutput: string[];
	scrollTop: number;
	isEmpty: boolean;
}

const LogPane: React.FC<LogPaneProps> = ({
	innerWidth,
	availableHeight,
	visibleOutput,
	scrollTop,
	isEmpty,
}) => (
	<Box
		flexDirection="column"
		width={innerWidth}
		height={availableHeight}
		flexShrink={0}
		flexGrow={0}
		overflow="hidden"
	>
		{visibleOutput.map((line, i) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: key is the line's absolute index in the output buffer (scrollTop + i). Stable across scroll/tail so React updates the existing <Text> in place instead of unmount/remount on every chunk — that remounting was a major flicker source.
			<Text key={scrollTop + i} wrap="truncate-end">
				{line.length > 0 ? line : " "}
			</Text>
		))}
		{isEmpty && <Text color="gray">No output yet...</Text>}
	</Box>
);

// Each option has a single-key shortcut. The labels also display this key
// inline (via <Kbd>) so the footer is both legend *and* actionable list —
// there's no separate hint row. Rerun has no shortcut on purpose: in the
// success-with-args menu it sits next to "Run" (which already binds `r`),
// and the menu is reachable via h/l + Enter.
const OPTION_KEYS: Record<string, string | undefined> = {
	Run: "r",
	Retry: "r",
	"Run With Deps": "R",
	Rerun: undefined,
	"Copy Logs": "c",
	Kill: "K",
	Close: "x",
};

interface FooterProps {
	options: readonly string[];
	selectedOption: number;
	isFailed: boolean;
	message: string;
	outlineColor: string;
	innerWidth: number;
}

const DetailFooter: React.FC<FooterProps> = ({
	options,
	selectedOption,
	isFailed,
	message,
	outlineColor,
	innerWidth,
}) => (
	<Box
		borderStyle="single"
		borderColor={outlineColor}
		borderLeft={false}
		borderRight={false}
		borderBottom={false}
		marginTop={0}
		flexDirection="row"
		justifyContent="space-between"
		flexShrink={0}
		width={innerWidth}
	>
		<Box>
			{isFailed && (
				<Text color="red" bold>
					Task Failed{"  "}
				</Text>
			)}
			<FooterOptions
				options={options}
				selectedOption={selectedOption}
				optionKeys={OPTION_KEYS}
			/>
		</Box>
		{message ? <Text color="green">{message}</Text> : null}
	</Box>
);

function optionsForStatus(
	status: TaskState["status"],
	hasArgs: boolean,
	hasDeps: boolean,
): readonly string[] {
	if (status === "RUNNING") return RUNNING_OPTIONS;
	let opts: readonly string[];
	if (status === "FAILURE")
		opts = hasArgs ? FAILURE_WITH_ARGS_OPTIONS : FAILURE_OPTIONS;
	else if (status === "SUCCESS" && hasArgs) opts = SUCCESS_WITH_ARGS_OPTIONS;
	else opts = DEFAULT_OPTIONS;
	// "Run With Deps" only differs from "Run" when there are upstream tasks
	// to walk; otherwise it's a confusing duplicate.
	if (!hasDeps) return opts.filter((o) => o !== "Run With Deps");
	return opts;
}

const TaskDetail: React.FC<TaskDetailProps> = ({
	task,
	width,
	description,
	cmd,
	fullscreen = false,
	inputLocked = false,
	hasArgs = false,
	hasDeps = false,
	onRun,
	onRerun,
	onRunWithDeps,
	onRetry,
	onKill,
	onClose,
	onToggleFullscreen,
}) => {
	const [, rows] = useStdoutDimensions();
	const isFailed = task.status === "FAILURE";
	// Memoize so identity stays stable across renders. Without useMemo, the
	// `!hasDeps` branch in optionsForStatus returns a fresh `.filter()` array
	// every render, which makes the [options]-keyed reset effect below fire
	// on every render and slam selectedOption back to 0 — so ←/→ never sticks.
	const options = useMemo(
		() => optionsForStatus(task.status, hasArgs, hasDeps),
		[task.status, hasArgs, hasDeps],
	);
	const [selectedOption, setSelectedOption] = useState(0);
	const [message, setMessage] = useState("");

	// Scroll state: `scrollTop` is the index of the first visible log line;
	// `tail` keeps the pane glued to the newest line as output arrives.
	const [scrollTop, setScrollTop] = useState(0);
	const [tail, setTail] = useState(true);

	// Chrome budget differs between normal and fullscreen modes. The app has
	// no outer frame, so only the top bar + its divider eat rows up top.
	// Normal     = top bar (1) + top-bar divider (1) + header block (3)
	//              + footer divider (1) + footer options (1) = 7
	//   + N rows for the description (it's allowed to wrap to multiple
	//     lines now — long task descriptions used to truncate, but the
	//     full text is more useful than ellipsis), + 1 for the command.
	// Fullscreen = top bar (1) + top-bar divider (1) + hint line (1) = 3
	//
	// Description wrap-width is approximated as `width - 2` (matching the
	// outer paddingX={1} on each side). char-per-column assumption is fine
	// for ASCII; off by at most a row for emoji-heavy descriptions.
	const descriptionRows =
		!fullscreen && description
			? Math.max(1, Math.ceil(description.length / Math.max(1, width - 2)))
			: 0;
	const cmdRow = !fullscreen && cmd ? 1 : 0;
	const availableHeight = fullscreen
		? Math.max(5, rows - 3)
		: Math.max(5, rows - 7 - descriptionRows - cmdRow);

	const totalLines = task.output.length;
	const maxScroll = Math.max(0, totalLines - availableHeight);

	// Keep view pinned to the bottom when in tail mode as new output streams in.
	useEffect(() => {
		if (tail) setScrollTop(maxScroll);
	}, [maxScroll, tail]);

	// Clamp if the buffer shrinks (e.g. Retry resets output).
	useEffect(() => {
		setScrollTop((prev) => Math.min(prev, maxScroll));
	}, [maxScroll]);

	// Jump back to tail + reset menu cursor when the selected task changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on task.id — state setters are stable and we must not rerun on every render.
	useEffect(() => {
		setTail(true);
		setSelectedOption(0);
	}, [task.id]);

	// Also reset when the status category flips (Running ↔ Failed ↔ Default),
	// because each uses a different options array — a stale index could land
	// out of bounds or on an unrelated option.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on options identity; setSelectedOption is stable.
	useEffect(() => {
		setSelectedOption(0);
	}, [options]);

	// Helpers that move `scrollTop` while keeping the tail-mode invariant
	// ("latched to the bottom when at the end") in sync.
	const scrollUpBy = (n: number) => {
		setTail(false);
		setScrollTop((prev) => Math.max(0, prev - n));
	};
	const scrollDownBy = (n: number) => {
		setScrollTop((prev) => {
			const next = Math.min(maxScroll, prev + n);
			if (next >= maxScroll) setTail(true);
			return next;
		});
	};

	const copyLogsToClipboard = () => {
		try {
			clipboardy.writeSync(task.output.join("\n"));
			setMessage("Logs copied!");
			setTimeout(() => setMessage(""), 2000);
		} catch {
			setMessage("Copy failed");
		}
	};

	const activateChoice = (choice: (typeof options)[number] | undefined) => {
		if (!choice) return;
		if (choice === "Retry") onRetry?.();
		else if (choice === "Run") onRun?.();
		else if (choice === "Rerun") onRerun?.();
		else if (choice === "Run With Deps") onRunWithDeps?.();
		else if (choice === "Kill") onKill?.();
		else if (choice === "Copy Logs") copyLogsToClipboard();
		else if (choice === "Close") onClose?.();
	};

	const tryPageScroll = (input: string, key: Key): boolean => {
		const half = Math.max(1, Math.floor(availableHeight / 2));
		const page = Math.max(1, availableHeight - 1);
		if (key.pageUp || (key.ctrl && input === "u")) {
			scrollUpBy(half);
			return true;
		}
		if (key.pageDown || (key.ctrl && input === "d")) {
			scrollDownBy(half);
			return true;
		}
		if (key.ctrl && input === "b") {
			scrollUpBy(page);
			return true;
		}
		if (key.ctrl && input === "f") {
			scrollDownBy(page);
			return true;
		}
		return false;
	};

	const tryEdgeJump = (input: string): boolean => {
		if (input === "g") {
			setTail(false);
			setScrollTop(0);
			return true;
		}
		if (input === "G") {
			setTail(true);
			setScrollTop(maxScroll);
			return true;
		}
		return false;
	};

	// Arrow/j/k line-scroll is fullscreen-only — App.tsx owns arrows otherwise.
	const tryLineScroll = (input: string, key: Key): boolean => {
		if (!fullscreen) return false;
		if (key.upArrow || input === "k") {
			scrollUpBy(1);
			return true;
		}
		if (key.downArrow || input === "j") {
			scrollDownBy(1);
			return true;
		}
		return false;
	};

	const tryHandleScroll = (input: string, key: Key): boolean =>
		tryPageScroll(input, key) ||
		tryEdgeJump(input) ||
		tryLineScroll(input, key);

	// Direct single-key shortcuts — skip the menu entirely.
	// `R` / `K` are Shift+r / Shift+k so they arrive as distinct characters.
	const tryShortcut = (input: string): boolean => {
		if (input === "r") {
			if (isFailed) onRetry?.();
			else onRun?.();
			return true;
		}
		if (input === "R") {
			onRunWithDeps?.();
			return true;
		}
		if (input === "c") {
			copyLogsToClipboard();
			return true;
		}
		if (input === "K") {
			onKill?.();
			return true;
		}
		if (input === "x") {
			onClose?.();
			return true;
		}
		return false;
	};

	useInput(
		(input, key) => {
			if (tryHandleScroll(input, key)) return;

			if (input === "f" || (fullscreen && input === "q")) {
				onToggleFullscreen?.();
				return;
			}

			// Footer nav + activation are non-fullscreen only.
			if (fullscreen) return;

			if (tryShortcut(input)) return;

			handleFooterNavInput(
				input,
				key,
				options,
				selectedOption,
				setSelectedOption,
				activateChoice,
			);
		},
		{ isActive: !inputLocked },
	);

	// Mouse wheel scrolling — 3 lines per tick (standard OS convention).
	useMouseWheel((dir) => {
		if (dir === "up") {
			setTail(false);
			setScrollTop((prev) => Math.max(0, prev - 3));
		} else {
			setScrollTop((prev) => {
				const next = Math.min(maxScroll, prev + 3);
				if (next >= maxScroll) setTail(true);
				return next;
			});
		}
	});

	const visibleOutput = useMemo(
		() =>
			task.output
				.slice(scrollTop, scrollTop + availableHeight)
				.map(sanitizeLine),
		[task.output, scrollTop, availableHeight],
	);

	const innerWidth = fullscreen ? width : Math.max(10, width - 2);
	const outlineColor = isFailed ? "red" : "gray";
	const statusColor = STATUS_COLOR[task.status];
	const statusLabel = STATUS_LABEL[task.status];

	const scrollHint =
		totalLines > availableHeight
			? ` [${scrollTop + 1}–${Math.min(scrollTop + availableHeight, totalLines)} / ${totalLines}${tail ? " · tail" : ""}]`
			: "";

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			width={width}
			paddingX={fullscreen ? 0 : 1}
			overflow="hidden"
		>
			{!fullscreen && (
				<DetailHeader
					taskId={task.label ?? task.id}
					statusLabel={statusLabel}
					statusColor={statusColor}
					description={description}
					cmd={cmd}
					scrollHint={scrollHint}
					deemphasizeId={task.status === "IDLE"}
				/>
			)}

			<LogPane
				innerWidth={innerWidth}
				availableHeight={availableHeight}
				visibleOutput={visibleOutput}
				scrollTop={scrollTop}
				isEmpty={task.output.length === 0}
			/>

			{fullscreen ? (
				<Box width={innerWidth} flexShrink={0}>
					<Text dimColor>
						{task.label ?? task.id} [{statusLabel}]{scrollHint}
					</Text>
				</Box>
			) : (
				<DetailFooter
					options={options}
					selectedOption={selectedOption}
					isFailed={isFailed}
					message={message}
					outlineColor={outlineColor}
					innerWidth={innerWidth}
				/>
			)}
		</Box>
	);
};

export default TaskDetail;
