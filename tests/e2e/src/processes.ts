// Child processes and polling for the end-to-end run. Children start in their own process group
// so stopping one also stops what it spawned (cargo's test binary, the sandbox node).

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";

export interface Managed {
  readonly name: string;
  readonly logFile: string;
  stop(): Promise<void>;
}

export function start(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env?: Record<string, string>; logDir: string },
): Managed {
  const logFile = join(options.logDir, `${name}.log`);
  const fd = openSync(logFile, "a");
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  return {
    name,
    logFile,
    async stop() {
      if (child.exitCode !== null || child.pid === undefined) return;
      const group = -child.pid;
      try {
        process.kill(group, "SIGTERM");
      } catch {
        return;
      }
      const killTimer = setTimeout(() => {
        try {
          process.kill(group, "SIGKILL");
        } catch {
          // already gone
        }
      }, 5_000);
      await exited;
      clearTimeout(killTimer);
    },
  };
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Testnet finality and a shared, rate-limited public RPC make everything several times slower.
const PATIENCE = process.env.E2E_MODE === "testnet" ? 4 : 1;

/** Polls `probe` until it returns something other than `undefined` or `false`. */
export async function waitFor<T>(
  label: string,
  probe: () => Promise<T | undefined | false>,
  { timeoutMs, intervalMs = 1_000 }: { timeoutMs: number; intervalMs?: number },
): Promise<T> {
  const deadline = Date.now() + timeoutMs * PATIENCE;
  let last: unknown;
  for (;;) {
    try {
      const value = await probe();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      last = error;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs} ms waiting for ${label}${last ? `: ${String(last)}` : ""}`,
      );
    }
    await delay(intervalMs);
  }
}
