import { Graph, topologicalSort, hasCycle, outdegree, cloneGraph } from 'graph-data-structure';
import { NormalizedConfig, Task } from '../types/config.js';

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
          throw new Error(`Task "${taskId}" depends on missing task "${depId}"`);
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
    let tempGraph = cloneGraph(this.graph);
    
    let nodes = Array.from(tempGraph.nodes);
    while (nodes.length > 0) {
      // In dependency -> task graph, nodes with 0 incoming edges are those that can start.
      // Wait, outdegree(node) is 0? 
      // Let's check indegree.
      // Actually, if we use dependency -> task, nodes with NO incoming edges have 0 dependencies.
      
      // The library doesn't seem to have a fast 'indegree' on the graph object that is easy to use for all nodes.
      // It has a standalone 'indegree(graph, node)'.
      
      const leafNodes = nodes.filter(node => {
        // We want nodes with 0 incoming edges.
        // Let's see if we can calculate it easily.
        let hasIncoming = false;
        for (const [source, targets] of tempGraph.edges.entries()) {
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
      leafNodes.forEach(node => tempGraph.removeNode(node));
      nodes = Array.from(tempGraph.nodes);
    }

    return layers;
  }

  getTasks(): Record<string, Task> {
    return this.tasks;
  }
}