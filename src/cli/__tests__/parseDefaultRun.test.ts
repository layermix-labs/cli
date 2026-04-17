import { describe, expect, it } from "vitest";
import { parseDefaultRun } from "../default-run.js";

describe("parseDefaultRun", () => {
	it("treats `-t TAG` as a tag selector", () => {
		expect(parseDefaultRun("-t test")).toEqual({ tag: "test" });
	});

	it("supports the long --tag form too", () => {
		expect(parseDefaultRun("--tag deploy")).toEqual({ tag: "deploy" });
	});

	it("treats a single bare token as one task id", () => {
		expect(parseDefaultRun("build")).toEqual({ taskIds: ["build"] });
	});

	it("treats whitespace-separated tokens as multiple task ids", () => {
		expect(parseDefaultRun("build deploy notify")).toEqual({
			taskIds: ["build", "deploy", "notify"],
		});
	});

	it("collapses any extra inner whitespace", () => {
		expect(parseDefaultRun("  build    deploy  ")).toEqual({
			taskIds: ["build", "deploy"],
		});
	});

	it("returns an empty selector for empty / whitespace input", () => {
		expect(parseDefaultRun("")).toEqual({});
		expect(parseDefaultRun("   ")).toEqual({});
	});
});
