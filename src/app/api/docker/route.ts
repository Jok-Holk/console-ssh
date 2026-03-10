import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

function sshExec(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ssh = new Client();
    ssh
      .on("ready", () => {
        ssh.exec(cmd, (err, stream) => {
          if (err) return reject(err);
          let out = "";
          stream.on("data", (d: Buffer) => (out += d.toString()));
          stream.on("close", () => {
            ssh.end();
            resolve(out);
          });
        });
      })
      .on("error", reject)
      .connect({
        host: process.env.VPS_HOST,
        port: 22,
        username: process.env.VPS_USER,
        privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
      });
  });
}

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

// GET /api/docker — list containers
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await sshExec(
    `docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}"}'`,
  );
  const containers = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return NextResponse.json({ containers });
}

// POST /api/docker — action
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, action } = await request.json();

  // Whitelist actions
  const allowed = ["start", "stop", "restart"];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  // Validate id — only accepted hex characters
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    return NextResponse.json(
      { error: "Invalid container id" },
      { status: 400 },
    );
  }

  await sshExec(`docker ${action} ${id}`);
  return NextResponse.json({ success: true });
}
