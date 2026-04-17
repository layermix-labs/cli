import ansiRegex from "ansi-regex";
import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { STATUS_COLOR, STATUS_LABEL } from "./status.js";
import { useMouseWheel } from "./useMouseWheel.js";
import useStdoutDimensions from "./useStdoutDimensions.js";
import type { TaskState } from "./useTaskState.js";

interface TaskDetailProps {
	task: TaskState;
	width: number;
	description?: string;
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
const SGR_ONLY = /^\x1b\[[\d;:?]*m$/;
const CURSOR_CTRL = /[\r\n\x08\x0b\x0c]/g;
const TAB_REPLACEMENT = "  ";

export const sanitizeLine = (s: string) =>
	s
		.replace(ANSI, (match) => (SGR_ONLY.test(match) ? match : ""))
		.replace(CURSOR_CTRL, "")
		.replace(/\t/g, TAB_REPLACEMENT);

const TaskDetail: React.FC<TaskDetailProps> = ({
	task,
	width,
	description,
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
	const isRunning = task.status === "RUNNING";
	const options = isRunning
		? RUNNING_OPTIONS
		: isFailed
			? FAILURE_OPTIONS
			: DEFAULT_OPTIONS;
	const [selectedOption, setSelectedOption] = useState(0);
	const [message, setMessage] = useState("");

	// Scroll state: `scrollTop` is the index of the first visible log line;
	// `tail` keeps the pane glued to the newest line as output arrives.
	const [scrollTop, setScrollTop] = useState(0);
	const [tail, setTail] = useState(true);

	// Chrome budget differs between normal and fullscreen modes.
	// Normal     = top bar (3) + outer border (2) + header block (3) + footer menu (4) = 12
	//   +1 row when the task has a description (rendered under the header title).
	// Fullscreen = top bar (3) + hint line (1)                                          = 4
	//   (fullscreen drops the outer border + padding so output goes edge-to-edge)
	const descriptionRow = !fullscreen && description ? 1 : 0;
	const availableHeight = fullscreen
		? Math.max(5, rows - 4)
		: Math.max(5, rows - 12 - descriptionRow);

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
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		setSelectedOption(0);
		setTail(true);
	}, [task.id]);

	// Also reset when the status category flips (Running ↔ Failed ↔ Default),
	// because each uses a different options array — a stale index could land
	// out of bounds or on an unrelated option.
	useEffect(() => {
		setSelectedOption(0);
	}, [options]);

	useInput((input, key) => {
		// --- Scroll controls (always available inside TaskDetail) ---
		const half = Math.max(1, Math.floor(availableHeight / 2));
		const page = Math.max(1, availableHeight - 1);

		if (key.pageUp || (key.ctrl && input === "u")) {
			setTail(false);
			setScrollTop((prev) => Math.max(0, prev - half));
			return;
		}
		if (key.pageDown || (key.ctrl && input === "d")) {
			setScrollTop((prev) => {
				const next = Math.min(maxScroll, prev + half);
				if (next >= maxScroll) setTail(true);
				return next;
			});
			return;
		}
		if (key.ctrl && input === "b") {
			setTail(false);
			setScrollTop((prev) => Math.max(0, prev - page));
			return;
		}
		if (key.ctrl && input === "f") {
			setScrollTop((prev) => {
				const next = Math.min(maxScroll, prev + page);
				if (next >= maxScroll) setTail(true);
				return next;
			});
			return;
		}
		if (input === "g") {
			setTail(false);
			setScrollTop(0);
			return;
		}
		if (input === "G") {
			setTail(true);
			setScrollTop(maxScroll);
			return;
		}

		// --- Line-by-line scroll (fullscreen only; non-fullscreen lets
		// App.tsx's sidebar nav own the arrow keys) ---
		if (fullscreen) {
			if (key.upArrow || input === "k") {
				setTail(false);
				setScrollTop((prev) => Math.max(0, prev - 1));
				return;
			}
			if (key.downArrow || input === "j") {
				setScrollTop((prev) => {
					const next = Math.min(maxScroll, prev + 1);
					if (next >= maxScroll) setTail(true);
					return next;
				});
				return;
			}
		}

		// --- Fullscreen toggle ---
		if (input === "f" || (fullscreen && input === "q")) {
			onToggleFullscreen?.();
			return;
		}

		// --- Menu nav (normal mode only; footer isn't rendered in fullscreen) ---
		if (fullscreen) return;

		if (key.leftArrow || input === "h") {
			setSelectedOption((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		}
		if (key.rightArrow || input === "l") {
			setSelectedOption((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		}
		if (key.return) {
			const choice = options[selectedOption];
			if (choice === "Retry") onRetry?.();
			else if (choice === "Run") onRun?.();
			else if (choice === "Run With Deps") onRunWithDeps?.();
			else if (choice === "Kill") onKill?.();
			else if (choice === "Copy Logs") {
				try {
					clipboardy.writeSync(task.output.join("\n"));
					setMessage("Logs copied!");
					setTimeout(() => setMessage(""), 2000);
				} catch {
					setMessage("Copy failed");
				}
			} else if (choice === "Close") onClose?.();
		}
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
				<Box
					marginBottom={1}
					borderStyle="single"
					borderTop={false}
					borderLeft={false}
					borderRight={false}
					borderColor="gray"
					flexDirection="column"
				>
					<Box>
						<Text bold>Task: {task.id} </Text>
						<Text color={statusColor}>[{statusLabel}]</Text>
						{scrollHint ? <Text dimColor>{scrollHint}</Text> : null}
					</Box>
					{description ? (
						<Text dimColor wrap="truncate-end">
							{description}
						</Text>
					) : null}
				</Box>
			)}

			<Box
				flexDirection="column"
				width={innerWidth}
				height={availableHeight}
				flexShrink={0}
				flexGrow={0}
				overflow="hidden"
			>
				{visibleOutput.map((line, i) => (
					<Text key={`${scrollTop}-${i}`} wrap="truncate-end">
						{line.length > 0 ? line : " "}
					</Text>
				))}
				{task.output.length === 0 && <Text color="gray">No output yet...</Text>}
			</Box>

			{fullscreen ? (
				<Box width={innerWidth} flexShrink={0}>
					<Text dimColor>
						{task.id} [{statusLabel}]{scrollHint} — ↑/↓ · PgUp/PgDn · Ctrl+U/D ·
						g/G · f or q to exit
					</Text>
				</Box>
			) : (
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
							<Text dimColor>
								←/→ Enter · PgUp/PgDn scroll · g/G top/tail · f fullscreen
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
			)}
		</Box>
	);
};

export default TaskDetail;
