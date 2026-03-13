import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

function authCheck(request: NextRequest) {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

function getSSHClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ssh = new Client();
    ssh
      .on("ready", () => resolve(ssh))
      .on("error", reject)
      .connect({
        host: process.env.VPS_HOST,
        port: 22,
        username: process.env.VPS_USER,
        privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
      });
  });
}

function exec(ssh: Client, cmd: string): Promise<string> {
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

// GET /api/pm2 — list all processes
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ssh = await getSSHClient();
  try {
    const out = await exec(ssh, "pm2 jlist");
    ssh.end();
    const processes = JSON.parse(out);
    const list = processes.map((p: any) => ({
      id: p.pm_id,
      name: p.name,
      status: p.pm2_env?.status ?? "unknown",
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? null,
      pid: p.pid,
      mode: p.pm2_env?.exec_mode ?? "fork",
    }));
    return NextResponse.json({ processes: list });
  } catch {
    ssh.end();
    return NextResponse.json({ error: "PM2 error" }, { status: 500 });
  }
}

// POST /api/pm2 — action on process
// Body: { id: number|string, action: "start"|"stop"|"restart"|"delete" }
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await request.json();
  const allowed = ["start", "stop", "restart", "delete", "flush"];
  if (!allowed.includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Sanitize id — only allow numbers or safe process names
  const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId)
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const ssh = await getSSHClient();
  try {
    await exec(ssh, `pm2 ${action} ${safeId}`);
    ssh.end();
    return NextResponse.json({ success: true });
  } catch {
    ssh.end();
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
