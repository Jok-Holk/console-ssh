import { NextRequest, NextResponse } from "next/server";
import { execSync, execFileSync } from "child_process";
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

function pm2Available(): boolean {
  try {
    execSync("which pm2", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!pm2Available())
    return NextResponse.json({ processes: [], warning: "PM2 not installed" });

  try {
    const out = execSync("pm2 jlist", { encoding: "utf8", timeout: 5000 });
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
  } catch (e) {
    return NextResponse.json({ processes: [], error: String(e) });
  }
}

export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!pm2Available())
    return NextResponse.json({ error: "PM2 not installed" }, { status: 503 });

  const { id, action } = await request.json();
  const allowed = ["start", "stop", "restart", "delete"];
  if (!allowed.includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Sanitize id
  const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId)
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    execFileSync("pm2", [action, safeId], { timeout: 10000 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
