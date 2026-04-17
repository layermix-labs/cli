import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';
import { TaskGraph } from './task-graph.js';
import { TaskRunner, TaskStatus } from './task-runner.js';

export interface ExecutorOptions {
  concurrency?: number;
  dryRun?: boolean;
  globalEnv?: Record<string, string>;
  rootDir?: string;
}

export interface ResolvedTask {
  id: string;
  cmd: string;
  cwd: string;
  env: Record<string, string>;
  dependsOn: string[];
  dependencies: string[];
  tags: string[];
}

export interface ExecutionPlan {
  root: string;
  executionPlan: string[][];
  tasks: Record<string, ResolvedTask>;
}

export class Executor extends EventEmitter {
  private taskRunners: Map<string, TaskRunner> = new Map();
  private concurrency: number;
  
  // State
  private pending = new Set<string>();
  private completed = new Set<string>();
  private failed = new Set<string>();
  private skipped = new Set<string>();
  private running = new Map<string, Promise<void>>();
  
  private isProcessing = false;
  private processQueuePromise: Promise<void> | null = null;

  constructor(private graph: TaskGraph, private options: ExecutorOptions = {}) {
    super();
    this.concurrency = options.concurrency || os.cpus().length;
  }

  /**
   * Starts a full execution of the graph (or subgraph).
   * Returns a promise that resolves when the queue is drained.
   */
  async execute(targetTaskIds?: string[], tag?: string): Promise<boolean> {
    if (this.options.dryRun) {
        // Dry run implementation as before
        return true;
    }

    this.scheduleRun(targetTaskIds, tag);
    if (this.processQueuePromise) {
      await this.processQueuePromise;
    }
    return this.failed.size === 0;
  }

  /**
   * Schedules a set of tasks (and their upstream deps) into the running queue
   * without wiping existing state. Safe to call repeatedly from the TUI as
   * the user triggers tags / tasks interactively. Already-running or
   * already-succeeded tasks are left alone; failed/skipped ones are reset.
   */
  scheduleRun(targetTaskIds?: string[], tag?: string): void {
    const tasksToRun = this.identifyTasks(targetTaskIds, tag);
    let added = false;

    for (const id of tasksToRun) {
      if (!this.taskRunners.has(id)) {
        const task = this.graph.getTask(id);
        if (!task) continue;
        const runner = new TaskRunner(task);
        runner.on('output', (data) => this.emit('taskOutput', id, data));
        this.taskRunners.set(id, runner);
        this.emit('taskAdded', id);
      }

      if (this.running.has(id) || this.completed.has(id) || this.pending.has(id)) continue;

      const runner = this.taskRunners.get(id)!;
      if (this.failed.has(id) || this.skipped.has(id)) {
        runner.reset();
        this.failed.delete(id);
        this.skipped.delete(id);
        this.emit('taskReset', id);
      }
      this.pending.add(id);
      added = true;
    }

    if (added) this.processQueue();
  }

  /**
   * Retries a specific task and its dependents.
   * Resets their state and resumes execution.
   */
  async retry(taskId: string) {
      // 1. Identify all downstream dependents
      const dependents = this.graph.getAllDependents(taskId);
      const toReset = new Set([taskId, ...dependents]);
      
      // 2. Reset state for these tasks
      for (const id of toReset) {
          // Only reset if we are tracking this task (it was part of initial set)
          // If a dependent wasn't part of the initial run (e.g. partial run), we might check.
          // But identifyTasks includes dependencies, not dependents. 
          // If we ran a partial graph, dependents might not be in taskRunners.
          // If they are not in taskRunners, we don't need to run them (unless we want to expand the graph? No, let's stick to current scope).
          
          if (this.taskRunners.has(id)) {
              const runner = this.taskRunners.get(id);
              if (runner) runner.reset();
              
              this.completed.delete(id);
              this.failed.delete(id);
              this.skipped.delete(id);
              // Remove from running? Should not be running if we are retrying (usually called when idle).
              if (this.running.has(id)) {
                  // This is tricky. If we retry while running, we might have issues.
                  // Assume retry is called when things are settled or on failed tasks.
              }
              
              this.pending.add(id);
              this.emit('taskReset', id);
          }
      }
      
      // 3. Trigger processing
      this.emit('retry', taskId);
      await this.processQueue();
  }

  private async processQueue() {
      // If already processing, wait for it? 
      // Or just join the existing loop?
      if (this.isProcessing && this.processQueuePromise) {
          return this.processQueuePromise;
      }

      this.isProcessing = true;
      
      this.processQueuePromise = (async () => {
          try {
            while (this.pending.size > 0 || this.running.size > 0) {
                // Check for ready tasks
                const ready: string[] = [];
                // We iterate over a copy of pending to avoid modification issues during iteration
                const currentPending = Array.from(this.pending);
                
                for (const taskId of currentPending) {
                    const task = this.graph.getTask(taskId)!;
                    
                    // Check dependencies
                    // A dependency is met if it is in 'completed'.
                    // Note: If a dependency was NOT in the initial set to run, we assume it's met?
                    // No, `identifyTasks` adds all upstream dependencies to the set.
                    // So we can assume all dependencies are tracked.
                    
                    const allDepsMet = task.dependsOn.every(depId => this.completed.has(depId));
                    const anyDepFailed = task.dependsOn.some(depId => this.failed.has(depId) || this.skipped.has(depId));

                    if (anyDepFailed) {
                        this.skipped.add(taskId);
                        this.pending.delete(taskId);
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
                    if (this.running.size >= this.concurrency) break;
                    
                    this.pending.delete(taskId);
                    const runner = this.taskRunners.get(taskId)!;
                    
                    this.emit('taskStart', taskId);
                    
                    const promise = runner.execute().then(() => {
                        this.completed.add(taskId);
                        this.emit('taskSuccess', taskId, runner.output);
                    }).catch((err) => {
                        this.failed.add(taskId);
                        this.emit('taskFail', taskId, err, runner.output);
                    }).finally(() => {
                        this.running.delete(taskId);
                    });

                    this.running.set(taskId, promise);
                }

                // Break if stuck (pending tasks but none running and none ready)
                if (this.running.size === 0 && this.pending.size > 0) {
                     // Check if any pending tasks can proceed? 
                     // If we are here, it means no tasks became ready in this pass.
                     // This implies unmet dependencies that are not failed/skipped yet?
                     // Or circular, but validation handles that.
                     // It might mean dependencies are missing from the graph tracking?
                     // But identifyTasks ensures closure.
                     // Break to avoid infinite loop.
                     break;
                }

                if (this.running.size > 0) {
                    // Wait for at least one to finish
                    await Promise.race(this.running.values());
                }
            }
          } finally {
              this.isProcessing = false;
              this.processQueuePromise = null;
          }
      })();
      
      return this.processQueuePromise;
  }

  getDryRunJson(targetTaskIds?: string[], tag?: string): ExecutionPlan {
      const tasksToRun = this.identifyTasks(targetTaskIds, tag);
      const subGraphTasks: Record<string, any> = {};

      for (const id of tasksToRun) {
          subGraphTasks[id] = this.graph.getTask(id)!;
      }

      const layers: string[][] = [];
      let currentSet = new Set(tasksToRun);

      while (currentSet.size > 0) {
          const layer: string[] = [];
          const nextSet = new Set(currentSet);

          for (const taskId of currentSet) {
              const task = subGraphTasks[taskId];
              const dependsOnInSet = task.dependsOn.filter((d: string) => currentSet.has(d));
              if (dependsOnInSet.length === 0) {
                  layer.push(taskId);
              }
          }

          if (layer.length === 0) break;

          layers.push(layer);
          layer.forEach(id => nextSet.delete(id));
          currentSet = nextSet;
      }

      const rootDir = this.options.rootDir || process.cwd();
      const globalEnv = this.options.globalEnv || {};
      const resolved: Record<string, ResolvedTask> = {};

      for (const id of tasksToRun) {
          const task = subGraphTasks[id];
          const deps = Array.from(this.graph.getAllDependencies(id));
          resolved[id] = {
              id,
              cmd: task.cmd,
              cwd: path.resolve(rootDir, task.cwd || '.'),
              env: { ...globalEnv, ...(task.env || {}) },
              dependsOn: task.dependsOn,
              dependencies: deps,
              tags: task.tags,
          };
      }

      return { root: rootDir, executionPlan: layers, tasks: resolved };
  }

  public identifyTasks(targetTaskIds?: string[], tag?: string): Set<string> {
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
      seeds = Object.keys(tasks);
    }

    for (const seed of seeds) {
      if (!tasks[seed]) continue;
      result.add(seed);
      const deps = this.graph.getAllDependencies(seed);
      deps.forEach(d => result.add(d));
    }

    return result;
  }
}