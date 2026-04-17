import { describe, expect, it } from "vitest";
import type { TaskArg } from "../../types/config.js";
import { resolveArgValues, shellQuote, substituteCmd } from "../cmd-args.js";

describe("shellQuote", () => {
	it("wraps a plain value in single quotes", () => {
		expect(shellQuote("hello")).toBe("'hello'");
	});

	it("returns '' for an empty string", () => {
		expect(shellQuote("")).toBe("''");
	});

	it("escapes embedded single quotes by close-escape-reopen", () => {
		expect(shellQuote("it's")).toBe(`'it'\\''s'`);
	});

	it("preserves spaces and special chars without expansion", () => {
		expect(shellQuote('a b $c `d` "e"')).toBe(`'a b $c \`d\` "e"'`);
	});
});

describe("substituteCmd", () => {
	it("replaces $1 and $2 in order", () => {
		expect(substituteCmd("echo $1 then $2", ["'A'", "'B'"])).toBe(
			"echo 'A' then 'B'",
		);
	});

	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal $-brace placeholder is exactly what we're testing.
	it("supports ${N} brace form", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal $-brace placeholder under test.
		expect(substituteCmd("echo ${1}_suffix", ["'X'"])).toBe("echo 'X'_suffix");
	});

	it("treats $10 as index 10, not $1 + 0", () => {
		const values = Array.from({ length: 10 }, (_, i) => `'v${i + 1}'`);
		expect(substituteCmd("$10", values)).toBe("'v10'");
	});

	it("leaves out-of-range placeholders untouched", () => {
		expect(substituteCmd("$1 $2 $3", ["'only'"])).toBe("'only' $2 $3");
	});

	it("ignores $0 (1-indexed)", () => {
		expect(substituteCmd("$0", ["'A'"])).toBe("$0");
	});
});

describe("resolveArgValues", () => {
	it("uses defaults when caller omits text/select values", () => {
		const declared: TaskArg[] = [
			{ type: "text", default: "fallback" },
			{ type: "select", choices: ["a", "b"], default: "a" },
		];
		expect(resolveArgValues(declared, [undefined, undefined])).toEqual([
			"'fallback'",
			"'a'",
		]);
	});

	it("throws when a text arg has no value and no default", () => {
		const declared: TaskArg[] = [{ type: "text", label: "Name" }];
		expect(() => resolveArgValues(declared, [undefined])).toThrow(
			/Missing value for arg \$1 \(Name\)/,
		);
	});

	it("throws when a file arg has no value (no defaults supported)", () => {
		const declared: TaskArg[] = [{ type: "file", multiple: false }];
		expect(() => resolveArgValues(declared, [undefined])).toThrow(
			/Missing value for arg \$1/,
		);
	});

	it("joins multi-select file paths with spaces, each shell-quoted", () => {
		const declared: TaskArg[] = [{ type: "file", multiple: true }];
		expect(
			resolveArgValues(declared, [["a/b.spec.ts", "c d.spec.ts"]]),
		).toEqual([`'a/b.spec.ts' 'c d.spec.ts'`]);
	});

	it("shell-quotes a single string value", () => {
		const declared: TaskArg[] = [{ type: "text" }];
		expect(resolveArgValues(declared, ["plain"])).toEqual(["'plain'"]);
	});
});
