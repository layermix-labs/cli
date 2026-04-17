import path from "node:path";
import { cosmiconfigSync } from "cosmiconfig";
import {
	type Config,
	ConfigSchema,
	type NormalizedConfig,
	type Task,
} from "../types/config.js";

export class ConfigLoader {
	private explorer = cosmiconfigSync("task-runner", {
		searchPlaces: [
			"task-runner.json",
			".task-runnerrc",
			".task-runnerrc.json",
			".task-runnerrc.yaml",
			".task-runnerrc.yml",
			".task-runnerrc.js",
			"task-runner.config.js",
		],
	});

	load(startDir: string = process.cwd()): NormalizedConfig {
		const configs: NormalizedConfig[] = [];
		let currentDir = startDir;

		while (true) {
			const result = this.explorer.search(currentDir);
			if (!result?.config) break;

			// cosmiconfig might return objects with null prototype or hidden properties.
			const plainConfig = JSON.parse(JSON.stringify(result.config));

			try {
				const validated = ConfigSchema.parse(plainConfig);
				configs.push(this.normalize(validated));
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				console.error(`Validation error for ${result.filepath}:`, message);
				throw e;
			}

			const parentDir = path.dirname(result.filepath);
			const nextDir = path.dirname(parentDir);

			if (nextDir === parentDir) break; // Reached root
			currentDir = nextDir;
		}

		// Merge configs: closer (lower in list because we pushed them in order) overrides further.
		// So we should merge from last to first.
		return this.mergeConfigs(configs.reverse());
	}

	private normalize(config: Config): NormalizedConfig {
		const tasks: Record<string, Task> = {};
		for (const task of config.tasks) {
			tasks[task.id] = task;
		}
		return {
			tasks,
			env: config.env,
			tags: config.tags,
		};
	}

	private mergeConfigs(configs: NormalizedConfig[]): NormalizedConfig {
		const merged: NormalizedConfig = {
			tasks: {},
			env: {},
			tags: {},
		};

		for (const config of configs) {
			merged.env = { ...merged.env, ...config.env };
			merged.tasks = { ...merged.tasks, ...config.tasks };
			merged.tags = { ...merged.tags, ...config.tags };
		}

		return merged;
	}
}
