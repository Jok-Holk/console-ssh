import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

function authCheck(request: NextRequest): boolean {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

// GET /api/settings/check-ssh
// Tests SSH connection with current config
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { getSSHConfig, getSSHClient } = await import("@/lib/ssh");

    // First check config (fast — no network)
    let config;
    try {
      config = getSSHConfig();
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return NextResponse.json({ ok: false, code: e.code, message: e.message });
    }

    // Then test actual connection
    const ssh = await getSSHClient();
    ssh.end();
    return NextResponse.json({
      ok: true,
      message: `Connected to ${config.username}@${config.host}`,
    });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({
      ok: false,
      code: e.code ?? "SSH_CONNECT_FAILED",
      message: e.message ?? "Connection failed",
    });
  }
}
