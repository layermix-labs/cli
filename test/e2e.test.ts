import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const CLI = path.resolve(ROOT, "src/cli/index.tsx");
const VITE_NODE = path.resolve(
	ROOT,
	"node_modules/.pnpm/vite-node@5.2.0_@types+node@25.0.8_tsx@4.21.0/node_modules/vite-node/dist/cli.mjs",
);
const FIXTURES = path.resolve(__dirname, "fixtures");

function runCli(args: string[], cwd: string, env: Record<string, string> = {}) {
	return execa("node", [VITE_NODE, "--root", ROOT, CLI, ...args], {
		cwd,
		reject: false,
		env: { ...process.env, ...env, NO_COLOR: "1" },
		// Force non-TTY so run uses linear mode.
		stdio: ["ignore", "pipe", "pipe"],
	});
}

// Creates a temp dir, passes the caller a path under it, and cleans up
// unconditionally. Used by the JUnit tests that all need a fresh scratch
// location for their report file.
async function withJunitTempDir<T>(
	relative: string,
	run: (junitPath: string) => Promise<T>,
): Promise<T> {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "layermix-junit-"));
	try {
		return await run(path.join(tmp, relative));
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

describe("CLI e2e", () => {
	const simple = path.join(FIXTURES, "simple");
	const failing = path.join(FIXTURES, "failing");
	const withArgs = path.join(FIXTURES, "with-args");
	const defaultRunTag = path.join(FIXTURES, "default-run-tag");
	const defaultRunTask = path.join(FIXTURES, "default-run-task");

	it("list prints defined tasks", async () => {
		const res = await runCli(["list"], simple);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("a:");
		expect(res.stdout).toContain("b:");
		expect(res.stdout).toContain("c:");
	});

	it("list prints task and tag descriptions when defined", async () => {
		const res = await runCli(["list"], simple);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("say hello from a");
		expect(res.stdout).toContain("#greet");
		expect(res.stdout).toContain("tasks that print a greeting");
	});

	it("validate succeeds on valid config", async () => {
		const res = await runCli(["validate"], simple);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("Configuration is valid");
	});

	it("run --dry-run-json includes resolved env, absolute cwd, deps tree", async () => {
		const res = await runCli(["run", "--dry-run-json", "-t", "greet"], simple);
		expect(res.exitCode).toBe(0);
		const plan = JSON.parse(res.stdout);
		expect(plan.root).toBe(simple);
		expect(plan.executionPlan).toEqual([["a"], ["b"]]);
		expect(plan.tasks.a.env.GREETING).toBe("hi");
		expect(plan.tasks.a.cwd).toBe(simple);
		expect(plan.tasks.b.dependencies).toContain("a");
	});

	it("run is the default command (no subcommand needed)", async () => {
		const res = await runCli(["--dry-run-json", "-t", "greet"], simple);
		expect(res.exitCode).toBe(0);
		const plan = JSON.parse(res.stdout);
		expect(plan.executionPlan).toEqual([["a"], ["b"]]);
	});

	it("run executes tasks in dependency order in linear mode", async () => {
		const res = await runCli(["run", "b"], simple);
		expect(res.exitCode).toBe(0);
		const aIdx = res.stdout.indexOf("[a] Starting");
		const bIdx = res.stdout.indexOf("[b] Starting");
		expect(aIdx).toBeGreaterThanOrEqual(0);
		expect(bIdx).toBeGreaterThan(aIdx);
		expect(res.stdout).toContain("hello-a");
		expect(res.stdout).toContain("hello-b");
	});

	it("run exits 1 and skips downstream on failure", async () => {
		const res = await runCli(["run", "downstream"], failing);
		expect(res.exitCode).toBe(1);
		expect(res.stdout).toContain("[bad] Failed");
		expect(res.stdout).toContain("[downstream] Not Started");
	});

	it("run --junit writes a JUnit XML report on failure", async () => {
		await withJunitTempDir("report.xml", async (junitPath) => {
			const res = await runCli(
				["run", "downstream", "--junit", junitPath],
				failing,
			);
			expect(res.exitCode).toBe(1);
			expect(fs.existsSync(junitPath)).toBe(true);
			const xml = fs.readFileSync(junitPath, "utf8");
			expect(xml).toContain('<?xml version="1.0"');
			expect(xml).toContain('name="bad"');
			expect(xml).toMatch(/<failure [^>]*type="CommandFailed"/);
			expect(xml).toContain('name="downstream"');
			expect(xml).toContain("<skipped");
			expect(xml).toMatch(/failures="1"/);
			expect(xml).toMatch(/skipped="1"/);
		});
	});

	it("run --junit writes a JUnit XML report on success", async () => {
		await withJunitTempDir("report.xml", async (junitPath) => {
			const res = await runCli(["run", "b", "--junit", junitPath], simple);
			expect(res.exitCode).toBe(0);
			expect(fs.existsSync(junitPath)).toBe(true);
			const xml = fs.readFileSync(junitPath, "utf8");
			expect(xml).toContain('name="a"');
			expect(xml).toContain('name="b"');
			expect(xml).toMatch(/failures="0"/);
			expect(xml).toMatch(/skipped="0"/);
		});
	});

	it("run --junit creates parent directories if missing", async () => {
		await withJunitTempDir(
			path.join("nested", "dir", "report.xml"),
			async (junitPath) => {
				const res = await runCli(["run", "--junit", junitPath, "a"], simple);
				expect(res.exitCode).toBe(0);
				expect(fs.existsSync(junitPath)).toBe(true);
			},
		);
	});

	const strippedEnv = () => ({
		...process.env,
		NO_COLOR: "1",
		CI: undefined,
		CONTINUOUS_INTEGRATION: undefined,
		GITHUB_ACTIONS: undefined,
		BUILD_ID: undefined,
		CLAUDECODE: undefined,
		CLAUDE_CODE_ENTRYPOINT: undefined,
		CURSOR_AGENT: undefined,
		CURSOR_TRACE_ID: undefined,
		AIDER_MODEL: undefined,
		AIDER_CHAT_HISTORY_FILE: undefined,
		CONTINUE_SESSION_ID: undefined,
		AI_AGENT: undefined,
	});

	it("--ci flag triggers linear mode; empty target with no defaultRun prints a hint and exits 0", async () => {
		// Strip CI + AI env vars so only the flag is driving the mode. Previously
		// --ci with no target auto-ran everything; now it prints the hint just
		// like a plain piped shell, so `layermix --ci` in an unfamiliar repo
		// can't accidentally execute the whole pipeline.
		const res = await execa(
			"node",
			[VITE_NODE, "--root", ROOT, CLI, "run", "--ci"],
			{
				cwd: failing,
				reject: false,
				env: strippedEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("No tasks specified");
		expect(res.stdout).not.toContain("[bad] Failed");
	});

	it("--ci flag with an explicit target still runs it linearly", async () => {
		const res = await execa(
			"node",
			[VITE_NODE, "--root", ROOT, CLI, "run", "--ci", "bad"],
			{
				cwd: failing,
				reject: false,
				env: strippedEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		expect(res.exitCode).toBe(1);
		expect(res.stdout).toContain("[bad] Failed");
	});

	it("--ai flag without target prints a hint and exits 0", async () => {
		const res = await execa(
			"node",
			[VITE_NODE, "--root", ROOT, CLI, "run", "--ai"],
			{
				cwd: failing,
				reject: false,
				env: strippedEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("No tasks specified");
		expect(res.stdout).not.toContain("[bad] Failed");
	});

	it("CLAUDECODE env auto-triggers AI-agent mode; empty target prints a hint and exits 0", async () => {
		const res = await execa("node", [VITE_NODE, "--root", ROOT, CLI, "run"], {
			cwd: failing,
			reject: false,
			env: { ...strippedEnv(), CLAUDECODE: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("No tasks specified");
		expect(res.stdout).not.toContain("[bad] Failed");
	});

	it("bare run with no target and no CI/AI signal prints a hint and exits 0", async () => {
		const res = await execa("node", [VITE_NODE, "--root", ROOT, CLI, "run"], {
			cwd: simple,
			reject: false,
			env: strippedEnv(),
			stdio: ["ignore", "pipe", "pipe"],
		});
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("No tasks specified");
		expect(res.stdout).not.toContain("[a] Starting");
	});

	it("init writes a task-runner.json with $schema reference", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "layermix-init-"));
		try {
			const res = await runCli(["init"], tmp);
			expect(res.exitCode).toBe(0);
			const written = JSON.parse(
				fs.readFileSync(path.join(tmp, "task-runner.json"), "utf8"),
			);
			expect(written.$schema).toBe(
				"https://unpkg.com/@layermix/cli@2.2.0/schema.json",
			);
			expect(Array.isArray(written.tasks)).toBe(true);
			expect(fs.existsSync(path.join(tmp, "schema.json"))).toBe(false);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("--arg fills positional placeholders into the cmd", async () => {
		const res = await runCli(
			["echo-name", "--ci", "-a", "Vito", "-a", "tui"],
			withArgs,
		);
		expect(res.exitCode).toBe(0);
		// Shell-quoting wraps each value in single quotes. echo strips the quotes.
		expect(res.stdout).toContain("greet Vito from tui");
	});

	it("falls back to declared default when --arg is omitted", async () => {
		const res = await runCli(["echo-default", "--ci"], withArgs);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("fallback");
	});

	it("--arg errors out when targeting more than one task", async () => {
		const res = await runCli(
			["echo-name", "echo-default", "-a", "x"],
			withArgs,
			{ CI: "1" },
		);
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("--arg can only be used with a single task");
	});

	it("defaultRun '-t TAG' kicks in when CI mode has no explicit target", async () => {
		const res = await runCli(["--ci"], defaultRunTag);
		expect(res.exitCode).toBe(0);
		// Tag-only run: gate-a + gate-b execute, the untagged "outside" task
		// stays untouched.
		expect(res.stdout).toContain("gate-a-ran");
		expect(res.stdout).toContain("gate-b-ran");
		expect(res.stdout).not.toContain("outside-ran");
	});

	it("explicit CLI target overrides defaultRun", async () => {
		const res = await runCli(["--ci", "outside"], defaultRunTag);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("outside-ran");
		expect(res.stdout).not.toContain("gate-a-ran");
	});

	it("defaultRun 'task-id' picks just that task in CI mode", async () => {
		const res = await runCli(["--ci"], defaultRunTask);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("single-default-ran");
		expect(res.stdout).not.toContain("noisy-ran");
	});

	it("defaultRun applies in piped non-CI mode (no hint, no run-all)", async () => {
		// No --ci, but stdin/stdout aren't a TTY because we pipe them — that's
		// the "linear non-CI" branch, where without defaultRun we'd print the
		// "No tasks specified" hint and exit 0. With defaultRun we should run
		// the configured target instead.
		const res = await runCli([], defaultRunTask);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("single-default-ran");
		expect(res.stdout).not.toContain("No tasks specified");
	});

	it("init refuses to overwrite without --force", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "layermix-init-"));
		try {
			fs.writeFileSync(path.join(tmp, "task-runner.json"), '{"tasks":[]}');
			const res = await runCli(["init"], tmp);
			expect(res.exitCode).toBe(1);
			expect(res.stderr).toContain("already exists");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
