// A local NEAR sandbox, started by the ignored `serve_sandbox` test in contracts/integration-tests.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { start, waitFor, type Managed } from "./processes.ts";

export interface SandboxInfo {
  rpcUrl: string;
  /** The sandbox's root account, used as the deployer. */
  accountId: string;
  secretKey: string;
}

export async function startSandbox(
  repoRoot: string,
  logDir: string,
): Promise<{ info: SandboxInfo; process: Managed }> {
  const infoFile = join(logDir, "sandbox-info.json");
  const sandbox = start(
    "sandbox",
    "cargo",
    [
      "test",
      "-p",
      "pontis-integration-tests",
      "--test",
      "serve_sandbox",
      "--",
      "--ignored",
      "--nocapture",
    ],
    { cwd: repoRoot, env: { PONTIS_SANDBOX_INFO: infoFile }, logDir },
  );
  try {
    // The first run compiles and downloads the sandbox binary, hence the long wait.
    const info = await waitFor(
      "the sandbox to start",
      async () => {
        try {
          return JSON.parse(readFileSync(infoFile, "utf8")) as SandboxInfo;
        } catch {
          return undefined;
        }
      },
      { timeoutMs: 900_000, intervalMs: 2_000 },
    );
    return { info, process: sandbox };
  } catch (error) {
    await sandbox.stop();
    throw error;
  }
}
