import { spawn, type ChildProcess } from "node:child_process";

export interface BackendOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  maxRestarts: number;
  onGiveUp: () => void;
}

/** Starts the local backend, restarts it a limited number of times and stops it on exit. */
export class Backend {
  private child: ChildProcess | null = null;
  private restarts = 0;
  private stopping = false;
  private ready: Promise<number> = Promise.reject(new Error("not started"));

  constructor(private options: BackendOptions) {
    this.ready.catch(() => {});
  }

  /** Resolves with the port once the backend is listening. */
  port(): Promise<number> {
    return this.ready;
  }

  start(): Promise<number> {
    const { command, args, cwd, env } = this.options;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
      this.child = child;
      let output = "";
      child.stdout!.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-200);
        const match = /PORT=(\d+)\r?\n/.exec(output);
        if (match) resolve(Number(match[1]));
      });
      child.once("error", (error) => {
        reject(error);
        this.failed(child);
      });
      child.once("exit", () => {
        reject(new Error("backend exited"));
        this.failed(child);
      });
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  private failed(child: ChildProcess) {
    if (this.child !== child || this.stopping) return;
    this.child = null;
    if (this.restarts >= this.options.maxRestarts) return this.options.onGiveUp();
    this.restarts += 1;
    void this.start();
  }

  /** Closing stdin asks the backend to finish; it is killed only if it does not. */
  async stop(timeoutMs = 8000): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.stdin?.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    await exited;
    clearTimeout(timer);
  }
}
