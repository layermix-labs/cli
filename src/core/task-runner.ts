import { execa, ExecaChildProcess } from 'execa';
import { Task } from '../types/config.js';

export type TaskStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'SKIPPED';

export class TaskRunner {
  private _status: TaskStatus = 'IDLE';
  private _stdout: string[] = [];
  private _stderr: string[] = [];
  private _startTime: number | null = null;
  private _endTime: number | null = null;
  private process: ExecaChildProcess | null = null;

  constructor(public readonly task: Task) {}

  get status(): TaskStatus {
    return this._status;
  }

  get output(): string {
    return [...this._stdout, ...this._stderr].join('\n');
  }

  get stdout(): string {
    return this._stdout.join('\n');
  }

  get stderr(): string {
    return this._stderr.join('\n');
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

  async execute(): Promise<void> {
    this._status = 'RUNNING';
    this._startTime = Date.now();
    this._stdout = [];
    this._stderr = [];

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
        this.process.stdout.on('data', (chunk) => {
          this._stdout.push(chunk.toString().trimEnd());
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (chunk) => {
          this._stderr.push(chunk.toString().trimEnd());
        });
      }

      await this.process;

      this._status = 'SUCCESS';
    } catch (error: any) {
      this._status = 'FAILURE';
      // If execa fails, it usually puts the output in the error object too, 
      // but since we are streaming, we should have captured it.
      // However, ensure we log the error message if it wasn't in stderr
      if (!this._stderr.length && error.message) {
        this._stderr.push(error.message);
      }
      throw error;
    } finally {
      this._endTime = Date.now();
      this.process = null;
    }
  }

  skip() {
    this._status = 'SKIPPED';
  }
}
