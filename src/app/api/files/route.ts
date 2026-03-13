import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

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

// Validate path — Do not allow traverse outside the home.
function safePath(p: string): string {
  const user = process.env.VPS_USER;
  const base = user === "root" ? "/root" : `/home/${user}`;
  const resolved = p.startsWith("/") ? p : `${base}/${p}`;
  if (!resolved.startsWith(base)) return base;
  return resolved;
}

// GET /api/files?path=/home/jokholk — list directory
// GET /api/files?path=/home/jokholk/file.txt&download=1 — download file
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const path = safePath(url.searchParams.get("path") || "");
  const download = url.searchParams.get("download") === "1";

  const ssh = await getSSHClient();

  return new Promise<NextResponse>((resolve) => {
    ssh.sftp((err, sftp) => {
      if (err) {
        ssh.end();
        return resolve(
          NextResponse.json({ error: "SFTP failed" }, { status: 500 }),
        );
      }

      if (download) {
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(path);
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("close", () => {
          ssh.end();
          const filename = path.split("/").pop() || "file";
          resolve(
            new NextResponse(Buffer.concat(chunks), {
              headers: {
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Type": "application/octet-stream",
              },
            }),
          );
        });
        stream.on("error", () => {
          ssh.end();
          resolve(NextResponse.json({ error: "Read failed" }, { status: 500 }));
        });
      } else {
        sftp.readdir(path, (err, list) => {
          ssh.end();
          if (err)
            return resolve(
              NextResponse.json({ error: "readdir failed" }, { status: 500 }),
            );
          const files = list.map((f) => ({
            name: f.filename,
            type: f.attrs.isDirectory() ? "dir" : "file",
            size: f.attrs.size,
            modified: new Date(f.attrs.mtime! * 1000)
              .toISOString()
              .split("T")[0],
          }));
          resolve(NextResponse.json({ files }));
        });
      }
    });
  });
}

// POST /api/files — upload file
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const path = safePath((formData.get("path") as string) || "");
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const destPath = `${path}/${file.name}`;

  const ssh = await getSSHClient();
  return new Promise<NextResponse>((resolve) => {
    ssh.sftp((err, sftp) => {
      if (err) {
        ssh.end();
        return resolve(
          NextResponse.json({ error: "SFTP failed" }, { status: 500 }),
        );
      }
      const writeStream = sftp.createWriteStream(destPath);
      writeStream.on("close", () => {
        ssh.end();
        resolve(NextResponse.json({ success: true }));
      });
      writeStream.on("error", () => {
        ssh.end();
        resolve(NextResponse.json({ error: "Write failed" }, { status: 500 }));
      });
      writeStream.end(buffer);
    });
  });
}
