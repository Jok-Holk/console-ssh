import { NextRequest, NextResponse } from "next/server";
import { execSync, execFileSync } from "child_process";
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

function dockerAvailable(): { ok: boolean; reason?: string } {
  try {
    execSync("which docker", { stdio: "pipe" });
  } catch {
    return { ok: false, reason: "Docker not installed" };
  }
  try {
    execSync("docker version", { stdio: "pipe", timeout: 3000 });
    return { ok: true };
  } catch {
    return { ok: false, reason: "Docker daemon not running" };
  }
}

// GET /api/docker — list containers
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const check = dockerAvailable();
  if (!check.ok)
    return NextResponse.json({ containers: [], warning: check.reason });

  try {
    const out = execSync(
      'docker ps -a --format \'{"Id":"{{.ID}}","Names":["{{.Names}}"],"Image":"{{.Image}}","State":"{{.State}}","Status":"{{.Status}}"}\'',
      { encoding: "utf8", timeout: 5000 },
    );
    const containers = out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return NextResponse.json({ containers });
  } catch (e) {
    return NextResponse.json({ containers: [], error: String(e) });
  }
}

// POST /api/docker — action on container
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const check = dockerAvailable();
  if (!check.ok)
    return NextResponse.json({ error: check.reason }, { status: 503 });

  const { id, action } = await request.json();
  const allowed = ["start", "stop", "restart"];
  if (!allowed.includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Sanitize container id
  const safeId = String(id)
    .replace(/[^a-zA-Z0-9_\-]/g, "")
    .slice(0, 64);
  if (!safeId)
    return NextResponse.json(
      { error: "Invalid container id" },
      { status: 400 },
    );

  try {
    execFileSync("docker", [action, safeId], { timeout: 15000 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
