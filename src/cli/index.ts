import { Command } from 'commander';
import { ConfigLoader } from '../core/config-loader.js';
import { TaskGraph } from '../core/task-graph.js';
import { Executor } from '../core/executor.js';
import chalk from 'chalk';

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
  .command('run [taskIds...]')
  .description('Runs specific task(s) and their dependencies')
  .option('-t, --tag <tag>', 'Run all tasks with a specific tag')
  .option('--dry-run-json', 'Print execution plan in JSON')
  .option('--concurrency <number>', 'Maximum parallel tasks', parseInt)
  .option('--output-only-failed', 'Only show output for failed tasks')
  .action(async (taskIds, options) => {
    try {
      const loader = new ConfigLoader();
      const config = loader.load();
      const graph = new TaskGraph(config);
      
      const executor = new Executor(graph, {
        concurrency: options.concurrency,
        dryRun: options.dryRunJson,
      });

      if (options.dryRunJson) {
        const plan = executor.getDryRunJson(taskIds.length ? taskIds : undefined, options.tag);
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      // Setup listeners
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
             // Minimal output for success if filtering
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
        // Error message might be redundant if it was in stderr, but print it just in case
        // The error object comes from execa
        if (error && error.message) {
             // Often execa error message contains stdout/stderr, so we might want to be careful not to double print.
             // But we are managing output.
             // We'll trust 'output' captured stderr.
        }
      });
      
      executor.on('taskSkipped', (taskId) => {
          console.log(chalk.yellow(`[${taskId}] Skipped (Dependency failed)`));
      });

      const success = await executor.execute(taskIds.length ? taskIds : undefined, options.tag);
      
      if (!success) {
        process.exit(1);
      }

    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);