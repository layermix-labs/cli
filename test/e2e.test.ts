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

describe("CLI e2e", () => {
	const simple = path.join(FIXTURES, "simple");
	const failing = path.join(FIXTURES, "failing");

	it("list prints defined tasks", async () => {
		const res = await runCli(["list"], simple);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("a:");
		expect(res.stdout).toContain("b:");
		expect(res.stdout).toContain("c:");
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

	it("run --no-tui executes tasks in dependency order", async () => {
		const res = await runCli(["run", "b", "--no-tui"], simple);
		expect(res.exitCode).toBe(0);
		const aIdx = res.stdout.indexOf("[a] Starting");
		const bIdx = res.stdout.indexOf("[b] Starting");
		expect(aIdx).toBeGreaterThanOrEqual(0);
		expect(bIdx).toBeGreaterThan(aIdx);
		expect(res.stdout).toContain("hello-a");
		expect(res.stdout).toContain("hello-b");
	});

	it("run exits 1 and skips downstream on failure", async () => {
		const res = await runCli(["run", "--no-tui"], failing);
		expect(res.exitCode).toBe(1);
		expect(res.stdout).toContain("[bad] Failed");
		expect(res.stdout).toContain("[downstream] Not Started");
	});

	it("run with CI=true emits structured JSON report", async () => {
		const res = await runCli(["run", "--no-tui"], failing, { CI: "true" });
		expect(res.exitCode).toBe(1);
		const match = res.stdout.match(
			/---BEGIN MY-RUNNER-REPORT---\n([\s\S]+?)\n---END MY-RUNNER-REPORT---/,
		);
		expect(match).not.toBeNull();
		const report = JSON.parse(match?.[1]);
		expect(report.status).toBe("failure");
		expect(report.failures.map((f: any) => f.id)).toContain("bad");
		expect(report.skipped).toContain("downstream");
	});

	it("--ci flag alone implies --no-tui and emits the report", async () => {
		// Strip CI env vars so only the flag is driving the mode.
		const res = await execa(
			"node",
			[VITE_NODE, "--root", ROOT, CLI, "run", "--ci"],
			{
				cwd: failing,
				reject: false,
				env: {
					...process.env,
					NO_COLOR: "1",
					CI: undefined,
					CONTINUOUS_INTEGRATION: undefined,
					GITHUB_ACTIONS: undefined,
					BUILD_ID: undefined,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		expect(res.exitCode).toBe(1);
		expect(res.stdout).toContain("[bad] Failed");
		expect(res.stdout).toMatch(/---BEGIN MY-RUNNER-REPORT---/);
	});

	it("init writes a task-runner.json with $schema reference", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "my-runner-init-"));
		try {
			const res = await runCli(["init"], tmp);
			expect(res.exitCode).toBe(0);
			const written = JSON.parse(
				fs.readFileSync(path.join(tmp, "task-runner.json"), "utf8"),
			);
			expect(written.$schema).toBe("./schema.json");
			expect(Array.isArray(written.tasks)).toBe(true);
			expect(fs.existsSync(path.join(tmp, "schema.json"))).toBe(true);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("init refuses to overwrite without --force", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "my-runner-init-"));
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
