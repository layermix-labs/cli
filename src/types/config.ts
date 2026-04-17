import { z } from "zod";

export const TaskSchema = z.object({
	id: z.string(),
	cmd: z.string(),
	dependsOn: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
	cwd: z.string().optional(),
	// z.record is broken in 4.3.5 for some reason? Using catchall workaround.
	env: z.object({}).catchall(z.string()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const ConfigSchema = z.object({
	$schema: z.string().optional(),
	tasks: z.array(TaskSchema),
	env: z.object({}).catchall(z.string()).optional().default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface NormalizedConfig {
	tasks: Record<string, Task>;
	env: Record<string, string>;
}
