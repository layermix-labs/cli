import { Command } from 'commander';
import { ConfigLoader } from '../core/config-loader.js';
import { TaskGraph } from '../core/task-graph.js';
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

program.parse(process.argv);
