import { Text } from "ink";
import type React from "react";

// Inline keybinding hint: [x] with dim brackets and a light-blue letter.
// Returns a fragment so it slots into an existing <Text> row without
// inheriting styles from a dim-colored parent (which would dim the letter).
const Kbd: React.FC<{ k: string }> = ({ k }) => (
	<>
		<Text dimColor>[</Text>
		<Text color="blueBright">{k}</Text>
		<Text dimColor>]</Text>
	</>
);

export default Kbd;
