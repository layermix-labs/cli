import { z } from "zod";

const TaskSchema = z.object({
	id: z.string(),
	cmd: z.string(),
	description: z.string().optional(),
	dependsOn: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
	// UI-only label. Tasks sharing a `group` render under a collapsible
	// section in the TUI and are hidden from the flat Tasks list. Unlike
	// `tags`, `group` has no CLI behavior (you can't `run -g build`).
	group: z.string().optional(),
	cwd: z.string().optional(),
	// z.record is broken in 4.3.5 for some reason? Using catchall workaround.
	env: z.object({}).catchall(z.string()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const ConfigSchema = z.object({
	$schema: z.string().optional(),
	tasks: z.array(TaskSchema),
	env: z.object({}).catchall(z.string()).optional().default({}),
	// Optional dictionary of tag descriptions keyed by tag name.
	tags: z.object({}).catchall(z.string()).optional().default({}),
	// Optional dictionary of group descriptions keyed by group name —
	// mirrors `tags`. Group membership lives on the task via `group`.
	groups: z.object({}).catchall(z.string()).optional().default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface NormalizedConfig {
	tasks: Record<string, Task>;
	env: Record<string, string>;
	tags: Record<string, string>;
	groups: Record<string, string>;
}
