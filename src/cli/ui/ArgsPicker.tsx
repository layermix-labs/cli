import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { glob } from "tinyglobby";
import type { TaskArg } from "../../types/config.js";
import Kbd from "./Kbd.js";

interface ArgsPickerProps {
	taskId: string;
	args: TaskArg[];
	cwd: string;
	width: number;
	onSubmit: (values: (string | string[] | undefined)[]) => void;
	onCancel: () => void;
}

type Value = string | string[] | undefined;

// Friendly fallback when an arg has no `label`. Avoids "$1" strings filtering
// up into otherwise-readable prompts.
const labelFor = (arg: TaskArg, index: number): string =>
	arg.label ?? `Argument $${index + 1}`;

// ─── Text input ─────────────────────────────────────────────────────────────
interface TextInputProps {
	prompt: string;
	initial: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

const TextInput: React.FC<TextInputProps> = ({
	prompt,
	initial,
	onSubmit,
	onCancel,
}) => {
	const [value, setValue] = useState(initial);

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.return) return onSubmit(value);
		if (key.backspace || key.delete) {
			setValue((v) => v.slice(0, -1));
			return;
		}
		if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
	});

	return (
		<Box flexDirection="column">
			<Text dimColor>{prompt}</Text>
			<Box marginTop={1}>
				<Text color="cyan">› </Text>
				<Text>{value}</Text>
				<Text color="cyan" bold>
					▌
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					<Kbd k="Enter" /> confirm · <Kbd k="Esc" /> cancel
				</Text>
			</Box>
		</Box>
	);
};

// ─── Select input ───────────────────────────────────────────────────────────
interface SelectInputProps {
	prompt: string;
	choices: string[];
	initialIndex: number;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

const SelectInput: React.FC<SelectInputProps> = ({
	prompt,
	choices,
	initialIndex,
	onSubmit,
	onCancel,
}) => {
	const [cursor, setCursor] = useState(initialIndex);

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.return) return onSubmit(choices[cursor]);
		if (key.upArrow || input === "k") {
			setCursor((c) => (c > 0 ? c - 1 : choices.length - 1));
			return;
		}
		if (key.downArrow || input === "j") {
			setCursor((c) => (c < choices.length - 1 ? c + 1 : 0));
		}
	});

	return (
		<Box flexDirection="column">
			<Text dimColor>{prompt}</Text>
			<Box flexDirection="column" marginTop={1}>
				{choices.map((choice, i) => (
					<Text key={choice} color={i === cursor ? "cyan" : undefined}>
						{i === cursor ? "› " : "  "}
						{choice}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					<Kbd k="↑↓" /> nav · <Kbd k="Enter" /> select · <Kbd k="Esc" /> cancel
				</Text>
			</Box>
		</Box>
	);
};

// ─── File / folder picker ───────────────────────────────────────────────────
//
// Glob expansion runs once on mount. For a typical repo the result fits
// comfortably in memory; we cap the visible window at MAX_VISIBLE rows so a
// repo with thousands of matches still renders cleanly. Multi-select uses
// Space to toggle, Enter to confirm the current set.
const MAX_VISIBLE = 12;

interface PathPickerProps {
	prompt: string;
	cwd: string;
	pattern: string;
	multiple: boolean;
	mode: "file" | "folder";
	onSubmit: (value: string | string[]) => void;
	onCancel: () => void;
}

const PathPicker: React.FC<PathPickerProps> = ({
	prompt,
	cwd,
	pattern,
	multiple,
	mode,
	onSubmit,
	onCancel,
}) => {
	const [paths, setPaths] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [cursor, setCursor] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		let cancelled = false;
		glob(pattern, {
			cwd,
			onlyFiles: mode === "file",
			onlyDirectories: mode === "folder",
			dot: false,
			absolute: false,
		})
			.then((results) => {
				if (cancelled) return;
				setPaths(results.sort());
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [cwd, pattern, mode]);

	const visibleStart = paths
		? Math.max(
				0,
				Math.min(
					cursor - Math.floor(MAX_VISIBLE / 2),
					paths.length - MAX_VISIBLE,
				),
			)
		: 0;
	const visible = paths
		? paths.slice(visibleStart, visibleStart + MAX_VISIBLE)
		: [];

	const moveCursor = (delta: 1 | -1) => {
		if (!paths) return;
		setCursor((c) => {
			const next = c + delta;
			if (next < 0) return paths.length - 1;
			if (next >= paths.length) return 0;
			return next;
		});
	};

	const togglePath = (path: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});

	const submitCurrent = () => {
		if (!paths) return;
		if (!multiple) return onSubmit(paths[cursor]);
		// If the user never toggled anything, treat the highlighted row as
		// the single picked entry — common case for a glob that happens to
		// match exactly the file they wanted.
		const picks = selected.size > 0 ? Array.from(selected) : [paths[cursor]];
		onSubmit(picks);
	};

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (!paths || paths.length === 0) {
			if (key.return) onCancel();
			return;
		}
		if (key.upArrow || input === "k") return moveCursor(-1);
		if (key.downArrow || input === "j") return moveCursor(1);
		if (multiple && input === " ") return togglePath(paths[cursor]);
		if (key.return) submitCurrent();
	});

	const hint = multiple ? (
		<Text dimColor>
			<Kbd k="↑↓" /> nav · <Kbd k="Space" /> toggle · <Kbd k="Enter" /> confirm
			· <Kbd k="Esc" /> cancel
		</Text>
	) : (
		<Text dimColor>
			<Kbd k="↑↓" /> nav · <Kbd k="Enter" /> select · <Kbd k="Esc" /> cancel
		</Text>
	);

	let body: React.ReactNode;
	if (error) body = <Text color="red">Glob error: {error}</Text>;
	else if (!paths) body = <Text dimColor>Searching {pattern}…</Text>;
	else if (paths.length === 0)
		body = (
			<Text color="yellow">
				No matches for `{pattern}` in {cwd}
			</Text>
		);
	else
		body = (
			<Box flexDirection="column">
				{visible.map((path, i) => {
					const absoluteIndex = visibleStart + i;
					const isCursor = absoluteIndex === cursor;
					const isPicked = selected.has(path);
					const marker = multiple ? (isPicked ? "[x] " : "[ ] ") : "";
					return (
						<Text key={path} color={isCursor ? "cyan" : undefined}>
							{isCursor ? "› " : "  "}
							{marker}
							{path}
						</Text>
					);
				})}
				{paths.length > MAX_VISIBLE ? (
					<Text dimColor>
						{cursor + 1} / {paths.length}
					</Text>
				) : null}
			</Box>
		);

	return (
		<Box flexDirection="column">
			<Text dimColor>{prompt}</Text>
			<Text dimColor>
				Pattern: {pattern} (in {cwd})
			</Text>
			<Box marginTop={1}>{body}</Box>
			<Box marginTop={1}>{hint}</Box>
		</Box>
	);
};

// ─── Picker shell ───────────────────────────────────────────────────────────
const ArgsPicker: React.FC<ArgsPickerProps> = ({
	taskId,
	args,
	cwd,
	width,
	onSubmit,
	onCancel,
}) => {
	const [step, setStep] = useState(0);
	const [values, setValues] = useState<Value[]>(() =>
		new Array(args.length).fill(undefined),
	);

	const arg = args[step];
	const prompt = useMemo(
		() =>
			`Step ${step + 1} of ${args.length} — ${labelFor(arg, step)} (${arg.type})`,
		[step, args.length, arg],
	);

	const advance = (value: Value) => {
		const next = values.slice();
		next[step] = value;
		setValues(next);
		if (step + 1 >= args.length) onSubmit(next);
		else setStep(step + 1);
	};

	let body: React.ReactNode;
	if (arg.type === "text") {
		body = (
			<TextInput
				prompt={prompt}
				initial={(values[step] as string | undefined) ?? arg.default ?? ""}
				onSubmit={advance}
				onCancel={onCancel}
			/>
		);
	} else if (arg.type === "select") {
		const initialIndex = Math.max(
			0,
			arg.choices.indexOf(
				(values[step] as string | undefined) ?? arg.default ?? "",
			),
		);
		body = (
			<SelectInput
				prompt={prompt}
				choices={arg.choices}
				initialIndex={initialIndex}
				onSubmit={advance}
				onCancel={onCancel}
			/>
		);
	} else {
		body = (
			<PathPicker
				prompt={prompt}
				cwd={cwd}
				pattern={arg.glob ?? (arg.type === "file" ? "**/*" : "**")}
				multiple={arg.multiple ?? false}
				mode={arg.type}
				onSubmit={advance}
				onCancel={onCancel}
			/>
		);
	}

	return (
		<Box
			flexDirection="column"
			width={width}
			paddingX={1}
			paddingY={1}
			borderStyle="round"
			borderColor="cyan"
		>
			<Box marginBottom={1}>
				<Text bold>Run </Text>
				<Text bold color="cyan">
					{taskId}
				</Text>
				<Text dimColor> — collecting arguments</Text>
			</Box>
			{body}
		</Box>
	);
};

export default ArgsPicker;
