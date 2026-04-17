import ansiRegex from "ansi-regex";
import clipboardy from "clipboardy";
import { Box, type Key, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Kbd from "./Kbd.js";
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
	onRun?: () => void;
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
const RUNNING_OPTIONS = ["Kill", "Copy Logs", "Close"] as const;
const DEFAULT_OPTIONS = ["Run", "Run With Deps", "Copy Logs", "Close"] as const;

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
		{description ? (
			<Text bold wrap="truncate-end">
				{description}
			</Text>
		) : null}
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
			// biome-ignore lint/suspicious/noArrayIndexKey: visibleOutput is a flat, position-indexed log window; the line at a given row IS its identity and the scrollTop prefix forces remount on scroll.
			<Text key={`${scrollTop}-${i}`} wrap="truncate-end">
				{line.length > 0 ? line : " "}
			</Text>
		))}
		{isEmpty && <Text color="gray">No output yet...</Text>}
	</Box>
);

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
		borderStyle="bold"
		borderColor={outlineColor}
		marginTop={0}
		flexDirection="column"
		flexShrink={0}
		width={innerWidth}
	>
		<Box justifyContent="space-between">
			<Box>
				{isFailed && (
					<Text color="red" bold>
						Task Failed{" "}
					</Text>
				)}
				<Text>
					<Kbd k="←→" />
					<Text dimColor> menu · </Text>
					<Kbd k="Enter" />
					<Kbd k="r" />
					<Text dimColor> run · </Text>
					<Kbd k="R" />
					<Text dimColor> +deps · </Text>
					<Kbd k="c" />
					<Text dimColor> copy · </Text>
					<Kbd k="PgUp/Dn" />
					<Text dimColor> scroll · </Text>
					<Kbd k="f" />
					<Text dimColor> fullscreen</Text>
				</Text>
			</Box>
			{message ? <Text color="green">{message}</Text> : null}
		</Box>
		<Box>
			{options.map((opt, i) => (
				<Box key={opt} marginRight={2}>
					<Text
						color={i === selectedOption ? "black" : "white"}
						backgroundColor={i === selectedOption ? "white" : undefined}
					>
						{` ${opt} `}
					</Text>
				</Box>
			))}
		</Box>
	</Box>
);

function optionsForStatus(status: TaskState["status"]): readonly string[] {
	if (status === "RUNNING") return RUNNING_OPTIONS;
	if (status === "FAILURE") return FAILURE_OPTIONS;
	return DEFAULT_OPTIONS;
}

const TaskDetail: React.FC<TaskDetailProps> = ({
	task,
	width,
	description,
	cmd,
	fullscreen = false,
	onRun,
	onRunWithDeps,
	onRetry,
	onKill,
	onClose,
	onToggleFullscreen,
}) => {
	const [, rows] = useStdoutDimensions();
	const isFailed = task.status === "FAILURE";
	const options = optionsForStatus(task.status);
	const [selectedOption, setSelectedOption] = useState(0);
	const [message, setMessage] = useState("");

	// Scroll state: `scrollTop` is the index of the first visible log line;
	// `tail` keeps the pane glued to the newest line as output arrives.
	const [scrollTop, setScrollTop] = useState(0);
	const [tail, setTail] = useState(true);

	// Chrome budget differs between normal and fullscreen modes.
	// Normal     = top bar (3) + outer border (2) + header block (3) + footer menu (4) = 12
	//   +1 row each for command line and description when present.
	// Fullscreen = top bar (3) + hint line (1)                                          = 4
	//   (fullscreen drops the outer border + padding so output goes edge-to-edge)
	const descriptionRow = !fullscreen && description ? 1 : 0;
	const cmdRow = !fullscreen && cmd ? 1 : 0;
	const availableHeight = fullscreen
		? Math.max(5, rows - 4)
		: Math.max(5, rows - 12 - descriptionRow - cmdRow);

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

	// Reset menu selection + jump to tail when the selected task changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on task.id — state setters are stable and we must not rerun on every render.
	useEffect(() => {
		setSelectedOption(0);
		setTail(true);
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

	const activateChoice = (choice: (typeof options)[number]) => {
		if (choice === "Retry") onRetry?.();
		else if (choice === "Run") onRun?.();
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

	useInput((input, key) => {
		if (tryHandleScroll(input, key)) return;

		if (input === "f" || (fullscreen && input === "q")) {
			onToggleFullscreen?.();
			return;
		}

		// Footer menu only exists in non-fullscreen mode.
		if (fullscreen) return;

		// Single-key shortcuts for the common task actions. These mirror the
		// footer menu items but don't require arrow+Enter. `R` is shift+r so it
		// arrives as a distinct character from lowercase `r`.
		if (input === "r") {
			onRun?.();
			return;
		}
		if (input === "R") {
			onRunWithDeps?.();
			return;
		}
		if (input === "c") {
			copyLogsToClipboard();
			return;
		}

		if (key.leftArrow || input === "h") {
			setSelectedOption((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		}
		if (key.rightArrow || input === "l") {
			setSelectedOption((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		}
		if (key.return) activateChoice(options[selectedOption]);
	});

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

	const innerWidth = fullscreen ? width : Math.max(10, width - 4);
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
			borderStyle={fullscreen ? undefined : "single"}
			borderColor={fullscreen ? undefined : outlineColor}
			paddingX={fullscreen ? 0 : 1}
			overflow="hidden"
		>
			{!fullscreen && (
				<DetailHeader
					taskId={task.id}
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
					<Text>
						<Text dimColor>
							{task.id} [{statusLabel}]{scrollHint} —{" "}
						</Text>
						<Kbd k="↑↓" />
						<Text dimColor> · </Text>
						<Kbd k="PgUp/Dn" />
						<Text dimColor> · </Text>
						<Kbd k="Ctrl+U/D" />
						<Text dimColor> · </Text>
						<Kbd k="g/G" />
						<Text dimColor> · </Text>
						<Kbd k="f" />
						<Text dimColor>/</Text>
						<Kbd k="q" />
						<Text dimColor> exit</Text>
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
