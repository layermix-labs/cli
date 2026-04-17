import { Box, type Key, Text } from "ink";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import Kbd from "./Kbd.js";

// Menu surfaces (TaskDetail, TagDetail) all render the same horizontally-laid
// option pills with an optional [Kbd] hint and selection highlight, and they
// all bind h/l/← /→ for cursor movement plus Enter for activation. This file
// is the single source of truth for both — keep it minimal so the contract
// stays obvious, not generic.

interface FooterOptionsProps {
	options: readonly string[];
	selectedOption: number;
	optionKeys: Record<string, string | undefined>;
}

export const FooterOptions: React.FC<FooterOptionsProps> = ({
	options,
	selectedOption,
	optionKeys,
}) => (
	<>
		{options.map((opt, i) => {
			const k = optionKeys[opt];
			const isSelected = i === selectedOption;
			return (
				<Box key={opt} marginRight={i === options.length - 1 ? 0 : 3}>
					{k ? <Kbd k={k} /> : null}
					<Text
						color={isSelected ? "black" : undefined}
						backgroundColor={isSelected ? "cyan" : undefined}
						bold={isSelected}
					>
						{` ${opt} `}
					</Text>
				</Box>
			);
		})}
	</>
);

// Returns true when the input was consumed so callers can early-return from
// their useInput handler. Keeps the call sites a single line.
export const handleFooterNavInput = (
	input: string,
	key: Key,
	options: readonly string[],
	selectedOption: number,
	setSelectedOption: Dispatch<SetStateAction<number>>,
	onActivate: (choice: string | undefined) => void,
): boolean => {
	if (key.leftArrow || input === "h") {
		setSelectedOption((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		return true;
	}
	if (key.rightArrow || input === "l") {
		setSelectedOption((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		return true;
	}
	if (key.return) {
		onActivate(options[selectedOption]);
		return true;
	}
	return false;
};
