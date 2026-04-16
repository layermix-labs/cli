import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import isCI from 'is-ci';
import { ConfigLoader } from '../core/config-loader.js';
import { TaskGraph } from '../core/task-graph.js';
import { Executor } from '../core/executor.js';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import App from './ui/App.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alternate screen buffer + cursor hide. Pins the TUI to a full fresh pane,
// and restores the user's terminal scrollback on exit.
const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H\x1b[?25l';
const EXIT_ALT_SCREEN = '\x1b[?25h\x1b[?1049l';
let altScreenActive = false;

function enterAltScreen() {
  if (altScreenActive || !process.stdout.isTTY) return;
  process.stdout.write(ENTER_ALT_SCREEN);
  altScreenActive = true;
}

function exitAltScreen() {
  if (!altScreenActive) return;
  process.stdout.write(EXIT_ALT_SCREEN);
  altScreenActive = false;
}

process.on('exit', exitAltScreen);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    exitAltScreen();
    process.exit(1);
  });
}

const program = new Command();

program
  .name('my-runner')
  .description('A simple DAG-based task runner')
  .version('1.0.0');

program
  .command('list')
  .description('Lists all available tasks')
  .action(() => {
    try {
      const loader = new ConfigLoader();
      const config = loader.load();
      const tasks = Object.values(config.tasks);

      if (tasks.length === 0) {
        console.log(chalk.yellow('No tasks found.'));
        return;
      }

      console.log(chalk.cyan('Available tasks:'));
      tasks.forEach(task => {
        console.log(`- ${chalk.bold(task.id)}: ${task.cmd} ${task.tags.length ? chalk.gray(`[tags: ${task.tags.join(', ')}]`) : ''}`);
        if (task.dependsOn.length > 0) {
          console.log(`  ${chalk.gray(`Depends on: ${task.dependsOn.join(', ')}`)}`);
        }
      });
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Loads config and checks the DAG for errors')
  .action(() => {
    try {
      const loader = new ConfigLoader();
      const config = loader.load();
      const graph = new TaskGraph(config);
      
      console.log(chalk.green('✓ Configuration is valid.'));
      
      const layers = graph.getExecutionLayers();
      console.log(chalk.cyan('\nExecution Layers:'));
      layers.forEach((layer, i) => {
        console.log(`Layer ${i + 1}: ${layer.join(', ')}`);
      });

      const order = graph.getTopologicalSort();
      console.log(chalk.cyan('\nLinear Execution Order:'));
      console.log(order.join(' -> '));

    } catch (error: any) {
      console.error(chalk.red(`✕ Validation failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create a starter task-runner.json with $schema reference')
  .option('-f, --force', 'Overwrite an existing task-runner.json')
  .action((options) => {
    try {
      const cwd = process.cwd();
      const target = path.join(cwd, 'task-runner.json');
      if (fs.existsSync(target) && !options.force) {
        console.error(chalk.red(`task-runner.json already exists. Use --force to overwrite.`));
        process.exit(1);
      }

      const schemaTarget = path.join(cwd, 'schema.json');
      if (!fs.existsSync(schemaTarget)) {
        const bundled = path.resolve(__dirname, '../../schema.json');
        if (fs.existsSync(bundled)) {
          fs.copyFileSync(bundled, schemaTarget);
        }
      }

      const starter = {
        $schema: './schema.json',
        tasks: [
          { id: 'hello', cmd: 'echo hello', dependsOn: [], tags: ['example'] },
          { id: 'world', cmd: 'echo world', dependsOn: ['hello'], tags: ['example'] },
        ],
        env: {},
      };
      fs.writeFileSync(target, JSON.stringify(starter, null, 2) + '\n');
      console.log(chalk.green(`✓ Wrote ${target}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('run [taskIds...]', { isDefault: true })
  .description('Runs specific task(s) and their dependencies (default command)')
  .option('-t, --tag <tag>', 'Run all tasks with a specific tag')
  .option('--dry-run-json', 'Print execution plan in JSON')
  .option('--concurrency <number>', 'Maximum parallel tasks', parseInt)
  .option('--output-only-failed', 'Only show output for failed tasks')
  .option('--no-tui', 'Disable interactive TUI and use linear output')
  .option('--ci', 'CI mode: disable TUI and emit a structured JSON report block (auto-detected from common CI env vars)')
  .action(async (taskIds, options) => {
    try {
      const loader = new ConfigLoader();
      const config = loader.load();
      const graph = new TaskGraph(config);

      const executor = new Executor(graph, {
        concurrency: options.concurrency,
        dryRun: options.dryRunJson,
        globalEnv: config.env,
        rootDir: process.cwd(),
      });

      const ciMode = !!options.ci || isCI;
      const failures: { id: string; message: string; output: string }[] = [];

      if (options.dryRunJson) {
        const plan = executor.getDryRunJson(taskIds.length ? taskIds : undefined, options.tag);
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      // CI implies --no-tui. Also require a TTY and --no-tui not set.
      const useTui = process.stdout.isTTY && options.tui !== false && !ciMode;

      if (useTui) {
        const tasksToRun = Array.from(executor.identifyTasks(taskIds.length ? taskIds : undefined, options.tag));
        enterAltScreen();
        const app = render(<App executor={executor} initialTaskIds={tasksToRun} />, { patchConsole: false });

        executor.execute(taskIds.length ? taskIds : undefined, options.tag);

        await app.waitUntilExit();
        exitAltScreen();
        process.exit(0);
      } else {
        // Setup listeners for linear output
        executor.on('taskStart', (taskId) => {
            console.log(chalk.cyan(`[${taskId}] Starting...`));
        });

        executor.on('taskSuccess', (taskId, output) => {
            if (!options.outputOnlyFailed) {
                console.log(chalk.green(`[${taskId}] Finished (Success)`));
                if (output.trim()) {
                    console.log(chalk.gray(`--- Output for ${taskId} ---`));
                    console.log(output);
                    console.log(chalk.gray(`-------------------------`));
                }
            } else {
                console.log(chalk.green(`[${taskId}] Finished (Success)`));
            }
        });

        executor.on('taskFail', (taskId, error, output) => {
            console.log(chalk.red(`[${taskId}] Failed`));
            if (output.trim()) {
                console.log(chalk.gray(`--- Output for ${taskId} ---`));
                console.log(output);
                console.log(chalk.gray(`-------------------------`));
            }
            failures.push({
                id: taskId,
                message: error?.shortMessage || error?.message || String(error),
                output,
            });
        });

        const skippedIds: string[] = [];
        executor.on('taskSkipped', (taskId) => {
            console.log(chalk.yellow(`[${taskId}] Skipped (Dependency failed)`));
            skippedIds.push(taskId);
        });

        const success = await executor.execute(taskIds.length ? taskIds : undefined, options.tag);

        if (!success) {
            if (ciMode) {
                const report = {
                    status: 'failure',
                    failures,
                    skipped: skippedIds,
                };
                console.log('\n---BEGIN MY-RUNNER-REPORT---');
                console.log(JSON.stringify(report, null, 2));
                console.log('---END MY-RUNNER-REPORT---');
            }
            process.exit(1);
        } else if (ciMode) {
            console.log('\n---BEGIN MY-RUNNER-REPORT---');
            console.log(JSON.stringify({ status: 'success', failures: [], skipped: skippedIds }, null, 2));
            console.log('---END MY-RUNNER-REPORT---');
        }
      }

    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);