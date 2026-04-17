import { EventEmitter } from "node:events";
import { execa, type ResultPromise } from "execa";
import type { Task } from "../types/config.js";

export type TaskStatus =
	| "IDLE"
	| "QUEUED"
	| "RUNNING"
	| "SUCCESS"
	| "FAILURE"
	| "SKIPPED";

export class TaskRunner extends EventEmitter {
	private _status: TaskStatus = "IDLE";
	private _stdout: string[] = [];
	private _stderr: string[] = [];
	private process: ResultPromise | null = null;

	constructor(public readonly task: Task) {
		super();
	}

	get output(): string {
		return [...this._stdout, ...this._stderr].join("\n");
	}

	/**
	 * Terminates the currently-running process. Sends SIGTERM; if the child
	 * doesn't exit within 2s it falls back to SIGKILL. No-op if the task isn't
	 * running. The awaiting `execute()` promise rejects via the normal execa
	 * path, so the executor surfaces this as a taskFail — downstream tasks
	 * cascade-skip the same way they do for any other failure.
	 */
	kill(): boolean {
		if (!this.process || this._status !== "RUNNING") return false;
		const marker = "--- killed by user ---";
		this._stderr.push(marker);
		this.emit("output", marker);
		try {
			this.process.kill("SIGTERM");
		} catch {
			// Process already exited between the status check and the kill call.
		}
		return true;
	}

	async execute(): Promise<void> {
		this._status = "RUNNING";
		this._stdout = [];
		this._stderr = [];

		try {
			const env = { ...process.env, ...(this.task.env || {}) };

			this.process = execa(this.task.cmd, {
				shell: true,
				cwd: this.task.cwd || process.cwd(),
				env,
				all: true,
				forceKillAfterDelay: 2000,
			});

			if (this.process.stdout) {
				this.process.stdout.on("data", (chunk: Buffer | string) => {
					const text = chunk.toString().trimEnd();
					this._stdout.push(text);
					this.emit("output", text);
				});
			}

			if (this.process.stderr) {
				this.process.stderr.on("data", (chunk: Buffer | string) => {
					const text = chunk.toString().trimEnd();
					this._stderr.push(text);
					this.emit("output", text);
				});
			}

			await this.process;

			this._status = "SUCCESS";
		} catch (error) {
			this._status = "FAILURE";
			const message = error instanceof Error ? error.message : String(error);
			if (!this._stderr.length && message) {
				this._stderr.push(message);
				this.emit("output", message);
			}
			throw error;
		} finally {
			this.process = null;
		}
	}

	skip() {
		this._status = "SKIPPED";
	}

	reset() {
		this._status = "IDLE";
		this._stdout = [];
		this._stderr = [];
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
	}
}
