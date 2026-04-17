import type { TaskArg } from "../types/config.js";

// Wrap a value for safe inclusion in a `shell: true` command line. Single
// quotes are POSIX-safe — nothing inside expands — except the ' character
// itself, which we close, escape, and reopen. Empty values become `''`.
//
// We intentionally don't try to detect "already-quoted" input. The values
// arriving here come from arg pickers / CLI flags, not from the cmd string,
// so re-quoting is the right thing to do.
export function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Replace `$N` / `${N}` (1-indexed) in `cmd` with shell-quoted entries from
// `values`. Out-of-range placeholders are left untouched — that matches shell
// semantics (`$5` is empty string when only $1 is set), but here we'd rather
// leave the literal so misconfigurations are visible in the rendered command
// rather than silently turning into empty arguments.
//
// Single regex pass so `$10` reads as index 10, not `$1` followed by `0`.
const PLACEHOLDER = /\$\{(\d+)\}|\$(\d+)/g;

export function substituteCmd(cmd: string, values: string[]): string {
	return cmd.replace(PLACEHOLDER, (match, braced: string | undefined, bare) => {
		const idx = Number.parseInt(braced ?? bare, 10);
		if (Number.isNaN(idx) || idx < 1 || idx > values.length) return match;
		return values[idx - 1];
	});
}

// Resolve declared args + caller-supplied values into the final positional
// list passed to `substituteCmd`. Missing values fall back to the arg's
// default (text/select). File/folder args have no defaults — if the caller
// didn't supply one, we throw so the user sees a clear error rather than a
// silent empty path.
//
// `caller` is positional: caller[i] corresponds to declared[i] (i.e. `$(i+1)`).
// A caller entry of `undefined` means "use the default".
export function resolveArgValues(
	declared: TaskArg[],
	caller: (string | string[] | undefined)[],
): string[] {
	return declared.map((arg, i) => resolveOne(arg, caller[i], i));
}

const missingArgError = (arg: TaskArg, index: number): Error =>
	new Error(
		`Missing value for arg $${index + 1}${arg.label ? ` (${arg.label})` : ""}`,
	);

// Single-arg resolution. Split out so resolveArgValues stays a flat map and
// the per-arg branching (default fallback for text/select, throw for
// file/folder, multi-value join) lives behind one cyclomatic boundary.
function resolveOne(
	arg: TaskArg,
	provided: string | string[] | undefined,
	index: number,
): string {
	const isMissing = provided === undefined || provided === "";
	if (isMissing) {
		if (arg.type === "text" || arg.type === "select") {
			if (arg.default === undefined) throw missingArgError(arg, index);
			return shellQuote(arg.default);
		}
		throw missingArgError(arg, index);
	}
	// Multi-select file/folder: shell-quote each path and join with spaces.
	if (Array.isArray(provided)) return provided.map(shellQuote).join(" ");
	return shellQuote(provided);
}
