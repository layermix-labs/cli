import { describe, expect, it } from "vitest";
import type { NormalizedConfig } from "../../types/config.js";
import { TaskGraph } from "../task-graph.js";

describe("TaskGraph", () => {
	it("should correctly sort a simple linear dependency", () => {
		const config: NormalizedConfig = {
			tasks: {
				A: { id: "A", cmd: "echo A", dependsOn: [], tags: [] },
				B: { id: "B", cmd: "echo B", dependsOn: ["A"], tags: [] },
			},
			env: {},
			tags: {},
		};
		const graph = new TaskGraph(config);
		expect(graph.getTopologicalSort()).toEqual(["A", "B"]);
	});

	it("should correctly sort multiple dependencies", () => {
		const config: NormalizedConfig = {
			tasks: {
				clean: { id: "clean", cmd: "echo clean", dependsOn: [], tags: [] },
				lint: { id: "lint", cmd: "echo lint", dependsOn: [], tags: [] },
				build: {
					id: "build",
					cmd: "echo build",
					dependsOn: ["clean"],
					tags: [],
				},
				test: {
					id: "test",
					cmd: "echo test",
					dependsOn: ["build", "lint"],
					tags: [],
				},
			},
			env: {},
			tags: {},
		};
		const graph = new TaskGraph(config);
		const order = graph.getTopologicalSort();

		expect(order.indexOf("clean")).toBeLessThan(order.indexOf("build"));
		expect(order.indexOf("build")).toBeLessThan(order.indexOf("test"));
		expect(order.indexOf("lint")).toBeLessThan(order.indexOf("test"));
	});

	it("should detect circular dependencies", () => {
		const config: NormalizedConfig = {
			tasks: {
				A: { id: "A", cmd: "echo A", dependsOn: ["B"], tags: [] },
				B: { id: "B", cmd: "echo B", dependsOn: ["A"], tags: [] },
			},
			env: {},
			tags: {},
		};
		expect(() => new TaskGraph(config)).toThrow(/Circular dependency/);
	});

	it("should detect missing dependencies", () => {
		const config: NormalizedConfig = {
			tasks: {
				A: { id: "A", cmd: "echo A", dependsOn: ["B"], tags: [] },
			},
			env: {},
			tags: {},
		};
		expect(() => new TaskGraph(config)).toThrow(/depends on missing task "B"/);
	});

	it("should provide execution layers", () => {
		const config: NormalizedConfig = {
			tasks: {
				A: { id: "A", cmd: "echo A", dependsOn: [], tags: [] },
				B: { id: "B", cmd: "echo B", dependsOn: [], tags: [] },
				C: { id: "C", cmd: "echo C", dependsOn: ["A", "B"], tags: [] },
				D: { id: "D", cmd: "echo D", dependsOn: ["C"], tags: [] },
				E: { id: "E", cmd: "echo E", dependsOn: ["C"], tags: [] },
			},
			env: {},
			tags: {},
		};
		const graph = new TaskGraph(config);
		const layers = graph.getExecutionLayers();

		expect(layers).toHaveLength(3);
		expect(layers[0]).toContain("A");
		expect(layers[0]).toContain("B");
		expect(layers[1]).toEqual(["C"]);
		expect(layers[2]).toContain("D");
		expect(layers[2]).toContain("E");
	});
});
