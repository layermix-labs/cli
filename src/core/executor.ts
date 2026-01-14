import { EventEmitter } from 'events';
import os from 'os';
import { TaskGraph } from './task-graph.js';
import { TaskRunner, TaskStatus } from './task-runner.js';

export interface ExecutorOptions {
  concurrency?: number;
  dryRun?: boolean;
}

export interface ExecutionPlan {
  executionPlan: string[][];
}

export class Executor extends EventEmitter {
  private taskRunners: Map<string, TaskRunner> = new Map();
  private concurrency: number;

  constructor(private graph: TaskGraph, private options: ExecutorOptions = {}) {
    super();
    this.concurrency = options.concurrency || os.cpus().length;
  }

  async execute(targetTaskIds?: string[], tag?: string): Promise<boolean> {
    const tasksToRun = this.identifyTasks(targetTaskIds, tag);
    
    if (this.options.dryRun) {
        // For dry run, we just emit the plan or return it?
        // The requirement says "Output a JSON structure".
        // We can just construct the plan and maybe emit a special event or just return it?
        // But the method signature returns Promise<boolean> (success/fail).
        // Let's print via console.log for CLI? Or return the plan?
        // Let's implement a separate method for getting the plan, or just do it here.
        // The requirements say "Implement the --dry-run-json flag".
        return true;
    }

    // Initialize runners
    for (const taskId of tasksToRun) {
      const task = this.graph.getTask(taskId);
      if (task) {
        this.taskRunners.set(taskId, new TaskRunner(task));
      }
    }

    const pending = new Set(tasksToRun);
    const completed = new Set<string>(); // Success only
    const failed = new Set<string>();
    const skipped = new Set<string>();
    const running = new Map<string, Promise<void>>();

    // Loop until all done
    while (pending.size > 0 || running.size > 0) {
      // Check for ready tasks
      const ready: string[] = [];
      for (const taskId of pending) {
        const task = this.graph.getTask(taskId)!;
        
        // Check dependencies
        const allDepsMet = task.dependsOn.every(depId => completed.has(depId));
        const anyDepFailed = task.dependsOn.some(depId => failed.has(depId) || skipped.has(depId));

        if (anyDepFailed) {
            // Skip this task
            skipped.add(taskId);
            pending.delete(taskId);
            const runner = this.taskRunners.get(taskId);
            if (runner) {
                runner.skip();
                this.emit('taskSkipped', taskId);
            }
        } else if (allDepsMet) {
            ready.push(taskId);
        }
      }

      // Schedule ready tasks
      for (const taskId of ready) {
        if (running.size >= this.concurrency) break;
        
        pending.delete(taskId);
        const runner = this.taskRunners.get(taskId)!;
        
        this.emit('taskStart', taskId);
        
        const promise = runner.execute().then(() => {
          completed.add(taskId);
          this.emit('taskSuccess', taskId, runner.output);
        }).catch((err) => {
          failed.add(taskId);
          this.emit('taskFail', taskId, err, runner.output);
        }).finally(() => {
          running.delete(taskId);
        });

        running.set(taskId, promise);
      }

      // If nothing running and pending is not empty but no ready tasks -> Circular dependency or bug? 
      if (running.size === 0 && pending.size > 0) {
          break;
      }

      if (running.size > 0) {
        // Wait for at least one to finish
        await Promise.race(running.values());
      }
    }

    return failed.size === 0;
  }

  getDryRunJson(targetTaskIds?: string[], tag?: string): ExecutionPlan {
      const tasksToRun = this.identifyTasks(targetTaskIds, tag);
      const subGraphTasks: Record<string, any> = {};
      
      // Build a mini-graph of only the tasks to run
      for (const id of tasksToRun) {
          subGraphTasks[id] = this.graph.getTask(id)!;
      }
      
      // We can use the TaskGraph logic but restricted to these tasks.
      // Or we can just calculate layers manually.
      // Let's compute layers.
      
      const layers: string[][] = [];
      let currentSet = new Set(tasksToRun);
      
      while (currentSet.size > 0) {
          const layer: string[] = [];
          const nextSet = new Set(currentSet);
          
          for (const taskId of currentSet) {
              const task = subGraphTasks[taskId];
              // Check if all dependencies (that are also in the set) are satisfied (actually, we want tasks with NO dependencies in the current set)
              // Wait, topological sort layers:
              // Layer 0: Tasks with no dependencies within the set.
              // Remove them, repeat.
              
              const dependsOnInSet = task.dependsOn.filter((d: string) => currentSet.has(d));
              if (dependsOnInSet.length === 0) {
                  layer.push(taskId);
              }
          }
          
          if (layer.length === 0) {
               // Cycle? Should be caught earlier.
               break;
          }
          
          layers.push(layer);
          layer.forEach(id => nextSet.delete(id));
          currentSet = nextSet;
      }
      
      return { executionPlan: layers };
  }

  private identifyTasks(targetTaskIds?: string[], tag?: string): Set<string> {
    const tasks = this.graph.getTasks();
    const result = new Set<string>();

    let seeds: string[] = [];

    if (targetTaskIds && targetTaskIds.length > 0) {
      seeds = targetTaskIds;
    } else if (tag) {
      seeds = Object.values(tasks)
        .filter(t => t.tags.includes(tag))
        .map(t => t.id);
    } else {
      // All tasks
      seeds = Object.keys(tasks);
    }

    for (const seed of seeds) {
      if (!tasks[seed]) continue; // or throw
      result.add(seed);
      // Add dependencies
      const deps = this.graph.getAllDependencies(seed);
      deps.forEach(d => result.add(d));
    }

    return result;
  }
}
