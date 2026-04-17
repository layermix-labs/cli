import {
	cloneGraph,
	Graph,
	hasCycle,
	topologicalSort,
} from "graph-data-structure";
import type { NormalizedConfig, Task } from "../types/config.js";

export class TaskGraph {
	private graph = new Graph();
	private tasks: Record<string, Task>;

	constructor(config: NormalizedConfig) {
		this.tasks = config.tasks;
		this.buildGraph();
	}

	private buildGraph() {
		for (const taskId in this.tasks) {
			const task = this.tasks[taskId];
			this.graph.addNode(taskId);
			for (const depId of task.dependsOn) {
				if (!this.tasks[depId]) {
					throw new Error(
						`Task "${taskId}" depends on missing task "${depId}"`,
					);
				}
				// dependency -> task
				this.graph.addEdge(depId, taskId);
			}
		}

		if (hasCycle(this.graph)) {
			throw new Error(`Circular dependency detected`);
		}
	}

	getTopologicalSort(): string[] {
		// With dependency -> task, topologicalSort gives dependency before task.
		return topologicalSort(this.graph);
	}

	getExecutionLayers(): string[][] {
		const layers: string[][] = [];
		const tempGraph = cloneGraph(this.graph);

		let nodes = Array.from(tempGraph.nodes);
		while (nodes.length > 0) {
			// In dependency -> task graph, nodes with 0 incoming edges are those that can start.
			// Wait, outdegree(node) is 0?
			// Let's check indegree.
			// Actually, if we use dependency -> task, nodes with NO incoming edges have 0 dependencies.

			// The library doesn't seem to have a fast 'indegree' on the graph object that is easy to use for all nodes.
			// It has a standalone 'indegree(graph, node)'.

			const leafNodes = nodes.filter((node) => {
				// We want nodes with 0 incoming edges.
				// Let's see if we can calculate it easily.
				let hasIncoming = false;
				for (const [_source, targets] of tempGraph.edges.entries()) {
					if (targets.has(node)) {
						hasIncoming = true;
						break;
					}
				}
				return !hasIncoming;
			});

			if (leafNodes.length === 0 && nodes.length > 0) {
				throw new Error("Circular dependency detected during layer generation");
			}

			layers.push(leafNodes);
			for (const node of leafNodes) tempGraph.removeNode(node);
			nodes = Array.from(tempGraph.nodes);
		}

		return layers;
	}

	getTasks(): Record<string, Task> {
		return this.tasks;
	}

	getTask(id: string): Task | undefined {
		return this.tasks[id];
	}

	getAllDependencies(taskId: string): Set<string> {
		const dependencies = new Set<string>();
		const visit = (id: string) => {
			const task = this.tasks[id];
			if (!task) return;
			for (const depId of task.dependsOn) {
				if (!dependencies.has(depId)) {
					dependencies.add(depId);
					visit(depId);
				}
			}
		};
		visit(taskId);
		return dependencies;
	}

	getAllDependents(taskId: string): Set<string> {
		const dependents = new Set<string>();
		const visit = (id: string) => {
			// Get direct dependents (nodes where edge is id -> dependent)
			// Since we added edges as dep -> task, adjacent(id) gives tasks depending on id.
			const adjacent = this.graph.adjacent(id);
			if (!adjacent) return;
			for (const nextId of adjacent) {
				if (!dependents.has(nextId)) {
					dependents.add(nextId);
					visit(nextId);
				}
			}
		};
		visit(taskId);
		return dependents;
	}
}
