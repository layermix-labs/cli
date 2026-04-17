import { z } from "zod";

// Per-task input declaration. Positional: args[0] fills `$1` in the cmd,
// args[1] fills `$2`, etc. The four input types cover the common pickers we
// want in the TUI; `multiple` on file/folder turns the picker into checklist
// mode and joins the resulting paths with spaces (each shell-quoted).
const ArgTextSchema = z.object({
	type: z.literal("text"),
	label: z.string().optional(),
	default: z.string().optional(),
});

const ArgSelectSchema = z.object({
	type: z.literal("select"),
	label: z.string().optional(),
	choices: z.array(z.string()).min(1),
	default: z.string().optional(),
});

const ArgFileSchema = z.object({
	type: z.literal("file"),
	label: z.string().optional(),
	// Glob the picker offers (e.g. `**/*.spec.ts`). Defaults to `**/*` if omitted.
	glob: z.string().optional(),
	// Searched relative to the task's `cwd` (or repo root when cwd is unset).
	// Treat `undefined` as `false` at read time — schema-level default would
	// surface as `required: ["multiple"]` in JSON Schema, which forces users
	// to write `"multiple": false` in every file/folder arg.
	multiple: z.boolean().optional(),
});

const ArgFolderSchema = z.object({
	type: z.literal("folder"),
	label: z.string().optional(),
	glob: z.string().optional(),
	multiple: z.boolean().optional(),
});

const TaskArgSchema = z.discriminatedUnion("type", [
	ArgTextSchema,
	ArgSelectSchema,
	ArgFileSchema,
	ArgFolderSchema,
]);

export type TaskArg = z.infer<typeof TaskArgSchema>;

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
	// Positional input declarations referenced as `$1`, `$2`, ... in `cmd`.
	args: z.array(TaskArgSchema).optional(),
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
	// CLI-style fallback target used in non-TUI modes when the user didn't
	// supply task ids or `-t <tag>`. Examples: `"-t test"`, `"build"`,
	// `"build deploy"`. Bypassed entirely when the user opens an interactive
	// TUI session (idle TUI is preserved as the explicit "no target" UX).
	defaultRun: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface NormalizedConfig {
	tasks: Record<string, Task>;
	env: Record<string, string>;
	tags: Record<string, string>;
	groups: Record<string, string>;
	defaultRun?: string;
}
