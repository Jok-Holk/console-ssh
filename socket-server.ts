/**
 * socket-server.ts
 * SSH terminal relay via socket.io.
 * Reads .env manually so it works as a standalone PM2 process.
 */
import * as http from "http";
import { Server } from "socket.io";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "dotenv";

// Load .env relative to cwd
config({ path: path.join(process.cwd(), ".env") });

const PORT = parseInt(process.env.SOCKET_PORT ?? "3001");

// ── SSH config helper ────────────────────────────────────────────────────────
function getSSHConfig():
  | {
      host: string;
      port: number;
      username: string;
      privateKey: Buffer;
    }
  | { error: string } {
  const host = process.env.VPS_HOST;
  const username = process.env.VPS_USER;
  const keyPath = process.env.VPS_PRIVATE_KEY_PATH;

  if (!host || !username || !keyPath) {
    return {
      error: `SSH not configured. Missing: ${[
        !host && "VPS_HOST",
        !username && "VPS_USER",
        !keyPath && "VPS_PRIVATE_KEY_PATH",
      ]
        .filter(Boolean)
        .join(", ")}`,
    };
  }

  const absPath = path.resolve(process.cwd(), keyPath);
  if (!fs.existsSync(absPath)) {
    return { error: `SSH key file not found: ${absPath}` };
  }

  return { host, port: 22, username, privateKey: fs.readFileSync(absPath) };
}

// ── JWT verification ─────────────────────────────────────────────────────────
function verifyToken(token: string): boolean {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}

// ── HTTP + Socket.io server ──────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("socket-server ok\n");
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_WS_URL ?? "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // Auth check
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.headers?.cookie?.match(/authToken=([^;]+)/)?.[1];

  if (!token || !verifyToken(token)) {
    socket.emit("error", "Unauthorized");
    socket.disconnect(true);
    return;
  }

  // Check SSH config before attempting connection
  const sshConfig = getSSHConfig();
  if ("error" in sshConfig) {
    socket.emit(
      "data",
      `\r\n\x1b[31m[VPS Manager] SSH not configured: ${sshConfig.error}\x1b[0m\r\n`,
    );
    socket.emit(
      "data",
      `\r\n\x1b[33mGo to Settings to configure SSH.\x1b[0m\r\n`,
    );
    // Keep socket open — don't disconnect, user can see the error
    return;
  }

  const ssh = new Client();
  let shellStream: NodeJS.ReadWriteStream | null = null;
  let connected = false;

  ssh
    .on("ready", () => {
      connected = true;
      ssh.shell(
        { term: "xterm-256color", cols: 80, rows: 24 },
        (err, stream) => {
          if (err) {
            socket.emit(
              "data",
              `\r\n\x1b[31m[VPS Manager] Shell error: ${err.message}\x1b[0m\r\n`,
            );
            ssh.end();
            return;
          }

          shellStream = stream;

          stream.on("data", (data: Buffer) => {
            socket.emit("data", data.toString("utf8"));
          });

          stream.stderr.on("data", (data: Buffer) => {
            socket.emit("data", data.toString("utf8"));
          });

          stream.on("close", () => {
            socket.emit("data", "\r\n\x1b[33m[session closed]\x1b[0m\r\n");
            socket.disconnect(true);
            ssh.end();
          });

          socket.on("data", (data: string) => {
            if (shellStream) shellStream.write(data);
          });

          socket.on(
            "resize",
            ({ cols, rows }: { cols: number; rows: number }) => {
              if (shellStream) stream.setWindow(rows, cols, 0, 0);
            },
          );
        },
      );
    })
    .on("error", (err) => {
      const msg = err.message ?? "";
      let friendly = msg;
      if (msg.includes("Authentication") || msg.includes("auth")) {
        friendly =
          "SSH authentication failed. Ensure your key is in ~/.ssh/authorized_keys.";
      } else if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET")) {
        friendly = `Cannot connect to ${sshConfig.host}:22. Is SSH running?`;
      }
      socket.emit("data", `\r\n\x1b[31m[VPS Manager] ${friendly}\x1b[0m\r\n`);
      socket.emit(
        "data",
        `\r\n\x1b[33mCheck Settings > SSH configuration.\x1b[0m\r\n`,
      );
    })
    .connect(sshConfig);

  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
    if (shellStream) {
      try {
        shellStream.end();
      } catch {}
    }
    if (connected) {
      try {
        ssh.end();
      } catch {}
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[socket-server] listening on :${PORT}`);
  const cfg = getSSHConfig();
  if ("error" in cfg) {
    console.warn(`[socket-server] SSH not configured: ${cfg.error}`);
    console.warn(
      `[socket-server] Terminal will show error message to users until configured.`,
    );
  } else {
    console.log(`[socket-server] SSH config OK: ${cfg.username}@${cfg.host}`);
  }
});

export {};
