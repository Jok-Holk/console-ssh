/**
 * src/lib/ssh.ts
 * Shared SSH client factory — graceful, never crashes on missing config.
 */
import { Client } from "ssh2";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export type SSHError =
  | "SSH_NOT_CONFIGURED" // env vars missing
  | "SSH_KEY_NOT_FOUND" // key file doesn't exist
  | "SSH_AUTH_FAILED" // wrong key / not in authorized_keys
  | "SSH_CONNECT_FAILED"; // network / host unreachable

export class SSHConfigError extends Error {
  constructor(
    public code: SSHError,
    message: string,
  ) {
    super(message);
    this.name = "SSHConfigError";
  }
}

export function getSSHConfig(): {
  host: string;
  port: number;
  username: string;
  privateKey: Buffer;
} {
  const host = process.env.VPS_HOST;
  const username = process.env.VPS_USER;
  const keyPath = process.env.VPS_PRIVATE_KEY_PATH;

  if (!host || !username || !keyPath) {
    throw new SSHConfigError(
      "SSH_NOT_CONFIGURED",
      `SSH not configured. Missing: ${[
        !host && "VPS_HOST",
        !username && "VPS_USER",
        !keyPath && "VPS_PRIVATE_KEY_PATH",
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  // Resolve relative paths from cwd
  const absoluteKeyPath = resolve(process.cwd(), keyPath);

  if (!existsSync(absoluteKeyPath)) {
    throw new SSHConfigError(
      "SSH_KEY_NOT_FOUND",
      `SSH key file not found: ${absoluteKeyPath}. Configure the correct path in Settings.`,
    );
  }

  return {
    host,
    port: 22,
    username,
    privateKey: readFileSync(absoluteKeyPath),
  };
}

export function getSSHClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    let config: ReturnType<typeof getSSHConfig>;
    try {
      config = getSSHConfig();
    } catch (err) {
      return reject(err);
    }

    const ssh = new Client();
    const timeout = setTimeout(() => {
      ssh.destroy();
      reject(new SSHConfigError("SSH_CONNECT_FAILED", "Connection timed out"));
    }, 8000);

    ssh
      .on("ready", () => {
        clearTimeout(timeout);
        resolve(ssh);
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        const msg = err.message ?? "";
        if (msg.includes("Authentication") || msg.includes("auth")) {
          reject(
            new SSHConfigError(
              "SSH_AUTH_FAILED",
              "SSH authentication failed. Check that the key is in authorized_keys.",
            ),
          );
        } else {
          reject(
            new SSHConfigError(
              "SSH_CONNECT_FAILED",
              `SSH connect failed: ${msg}`,
            ),
          );
        }
      })
      .connect(config);
  });
}

/** Execute a command over SSH, returns stdout+stderr combined */
export function sshExec(ssh: Client, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d: Buffer) => (out += d.toString()));
      stream.stderr.on("data", (d: Buffer) => (out += d.toString()));
      stream.on("close", () => resolve(out));
    });
  });
}

/** Helper to return a standard error response for SSH failures */
export function sshErrorResponse(err: unknown): Response {
  const code = err instanceof SSHConfigError ? err.code : "SSH_CONNECT_FAILED";
  const message = err instanceof Error ? err.message : "SSH error";

  const status =
    code === "SSH_NOT_CONFIGURED" || code === "SSH_KEY_NOT_FOUND" ? 503 : 502;

  return Response.json({ error: message, code }, { status });
}
