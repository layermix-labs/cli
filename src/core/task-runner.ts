import { EventEmitter } from "node:events";
import { type ExecaChildProcess, execa } from "execa";
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
	private _startTime: number | null = null;
	private _endTime: number | null = null;
	private process: ExecaChildProcess | null = null;
	private _wasKilled = false;

	constructor(public readonly task: Task) {
		super();
	}

	get status(): TaskStatus {
		return this._status;
	}

	get output(): string {
		return [...this._stdout, ...this._stderr].join("\n");
	}

	get stdout(): string {
		return this._stdout.join("\n");
	}

	get stderr(): string {
		return this._stderr.join("\n");
	}

	get duration(): number {
		if (this._startTime && this._endTime) {
			return this._endTime - this._startTime;
		}
		if (this._startTime) {
			return Date.now() - this._startTime;
		}
		return 0;
	}

	setStatus(status: TaskStatus) {
		this._status = status;
	}

	get wasKilled(): boolean {
		return this._wasKilled;
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
		this._wasKilled = true;
		const marker = "--- killed by user ---";
		this._stderr.push(marker);
		this.emit("output", marker);
		try {
			this.process.kill("SIGTERM", { forceKillAfterTimeout: 2000 });
		} catch {
			// Process already exited between the status check and the kill call.
		}
		return true;
	}

	async execute(): Promise<void> {
		this._status = "RUNNING";
		this._startTime = Date.now();
		this._stdout = [];
		this._stderr = [];
		this._wasKilled = false;

		try {
			// Prepare environment variables
			const env = { ...process.env, ...(this.task.env || {}) };

			this.process = execa(this.task.cmd, {
				shell: true,
				cwd: this.task.cwd || process.cwd(),
				env,
				all: true, // Merges stdout and stderr into 'all' if we wanted, but we'll listen to streams
			});

			if (this.process.stdout) {
				this.process.stdout.on("data", (chunk) => {
					const text = chunk.toString().trimEnd();
					this._stdout.push(text);
					this.emit("output", text);
				});
			}

			if (this.process.stderr) {
				this.process.stderr.on("data", (chunk) => {
					const text = chunk.toString().trimEnd();
					this._stderr.push(text);
					this.emit("output", text); // We treat stderr as output too for streaming
				});
			}

			await this.process;

			this._status = "SUCCESS";
		} catch (error: any) {
			this._status = "FAILURE";
			// If execa fails, it usually puts the output in the error object too,
			// but since we are streaming, we should have captured it.
			// However, ensure we log the error message if it wasn't in stderr
			if (!this._stderr.length && error.message) {
				this._stderr.push(error.message);
				this.emit("output", error.message);
			}
			throw error;
		} finally {
			this._endTime = Date.now();
			this.process = null;
		}
	}

	skip() {
		this._status = "SKIPPED";
	}

	reset() {
		this._status = "IDLE";
		this._startTime = null;
		this._endTime = null;
		this._stdout = [];
		this._stderr = [];
		this._wasKilled = false;
		// If process is running, we should kill it?
		// Usually reset() is called on failed/done tasks.
		// If it's running, we assume the caller handled stopping it or we force kill.
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
	}
}
