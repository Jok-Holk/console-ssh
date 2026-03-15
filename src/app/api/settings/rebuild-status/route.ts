import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import jwt from "jsonwebtoken";

function authCheck(r: NextRequest) {
  const token = r.cookies.get("authToken")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

// GET /api/settings/rebuild-status
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appDir = process.env.APP_DIR ?? process.cwd();
  const logFile = join(appDir, ".rebuild.log");

  if (!existsSync(logFile)) return NextResponse.json({ status: "none" });

  const log = readFileSync(logFile, "utf8");
  const failed = log.includes("BUILD FAILED");
  const ok = log.includes("BUILD OK");

  return NextResponse.json({
    status: ok ? "ok" : failed ? "failed" : "running",
    log: log.slice(-3000),
  });
}
