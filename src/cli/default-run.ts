// Parse the config's `defaultRun` string into the same shape the CLI uses
// for explicit targets. Format mirrors the CLI surface so the value reads
// like the command you'd type — `"-t test"`, `"build"`, `"build deploy"`.
// Anything we don't recognize as a flag is treated as a task id, so a typo
// in `defaultRun` surfaces as "unknown task" rather than silently doing
// nothing.
//
// Lives in its own module (rather than inline in cli/index.tsx) so unit
// tests can import it without triggering the CLI's top-level
// `program.parse(process.argv)` side effect.
export function parseDefaultRun(s: string): {
	taskIds?: string[];
	tag?: string;
} {
	const tokens = s.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return {};
	if (tokens[0] === "-t" || tokens[0] === "--tag") {
		return { tag: tokens[1] };
	}
	return { taskIds: tokens };
}
