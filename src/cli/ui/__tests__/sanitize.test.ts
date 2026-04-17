import { describe, expect, it } from "vitest";
import { sanitizeLine } from "../TaskDetail.js";

describe("sanitizeLine", () => {
	it("keeps SGR color codes intact", () => {
		expect(sanitizeLine("\x1b[31mred\x1b[0m")).toBe("\x1b[31mred\x1b[0m");
		expect(sanitizeLine("\x1b[38;2;255;0;0mrgb\x1b[0m")).toBe(
			"\x1b[38;2;255;0;0mrgb\x1b[0m",
		);
		expect(sanitizeLine("\x1b[38:5:208mext\x1b[0m")).toBe(
			"\x1b[38:5:208mext\x1b[0m",
		);
	});

	it("strips cursor-movement CSI sequences (biome, eslint, tsc)", () => {
		expect(sanitizeLine("\x1b[2Kerase")).toBe("erase");
		expect(sanitizeLine("before\x1b[1Afterup")).toBe("beforefterup");
		expect(sanitizeLine("\x1b[?25lhide\x1b[?25hshow")).toBe("hideshow");
		expect(sanitizeLine("\x1b[Habc\x1b[Jclear")).toBe("abcclear");
	});

	it("strips OSC hyperlinks and window titles", () => {
		expect(sanitizeLine("\x1b]8;;https://x.com\x07link\x1b]8;;\x07")).toBe(
			"link",
		);
		expect(sanitizeLine("\x1b]0;window title\x07after")).toBe("after");
	});

	it("strips charset-select escapes", () => {
		expect(sanitizeLine("\x1b(Btext")).toBe("text");
	});

	it("strips bare cursor-control C0 chars", () => {
		expect(sanitizeLine("a\rb\nc\bd\ve\ff")).toBe("abcdef");
	});

	it("expands tabs to spaces so rendered width matches string-width", () => {
		// string-width reports \t as 0 cols but terminals render it wide.
		// If we don't expand, Ink's truncate-end under-measures and the line
		// spills past the pane, corrupting the surrounding layout.
		expect(sanitizeLine("\t\t\t}")).toBe("      }");
		expect(sanitizeLine("a\tb")).toBe("a  b");
		expect(sanitizeLine("no tabs here")).toBe("no tabs here");
	});

	it("handles a realistic biome-style line", () => {
		const input =
			"\x1b[?25l\x1b[2K\x1b[31m✗\x1b[0m  \x1b[1mlint/suspicious\x1b[0m  unused variable\x1b[?25h";
		const out = sanitizeLine(input);
		expect(out).toContain("✗");
		expect(out).toContain("lint/suspicious");
		expect(out).toContain("unused variable");
		// SGR preserved
		expect(out).toContain("\x1b[31m");
		expect(out).toContain("\x1b[1m");
		// Cursor/erase codes gone
		expect(out).not.toContain("\x1b[?25l");
		expect(out).not.toContain("\x1b[?25h");
		expect(out).not.toContain("\x1b[2K");
	});

	it("leaves plain text unchanged", () => {
		expect(sanitizeLine("hello world")).toBe("hello world");
		expect(sanitizeLine("")).toBe("");
	});
});
