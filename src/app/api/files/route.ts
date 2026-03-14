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

function safePath(p: string): string {
  const user = process.env.VPS_USER;
  const base = user === "root" ? "/root" : `/home/${user}`;
  const resolved = p.startsWith("/") ? p : `${base}/${p}`;
  if (!resolved.startsWith("/")) return base;
  return resolved;
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "yaml",
  "yml",
  "env",
  "sh",
  "bash",
  "py",
  "rb",
  "go",
  "rs",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "htm",
  "xml",
  "sql",
  "conf",
  "config",
  "ini",
  "toml",
  "lock",
  "log",
  "gitignore",
  "dockerfile",
  "makefile",
  "nginx",
  "service",
]);

function isTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return [
    "dockerfile",
    "makefile",
    "rakefile",
    "procfile",
    "readme",
    "license",
    "changelog",
  ].includes(filename.toLowerCase());
}

export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const path = safePath(url.searchParams.get("path") || "");
  const download = url.searchParams.get("download") === "1";
  const view = url.searchParams.get("view") === "1";
  const zip = url.searchParams.get("zip") === "1";

  const ssh = await getSSHClient();

  // Download folder as zip
  if (zip) {
    return new Promise<NextResponse>((resolve) => {
      ssh.exec(
        `cd "${path}/.." && zip -r - "${path.split("/").pop()}" 2>/dev/null`,
        (err, stream) => {
          if (err) {
            ssh.end();
            return resolve(
              NextResponse.json({ error: "Zip failed" }, { status: 500 }),
            );
          }
          const chunks: Buffer[] = [];
          stream.on("data", (d: Buffer) => chunks.push(d));
          stream.on("close", () => {
            ssh.end();
            resolve(
              new NextResponse(Buffer.concat(chunks), {
                headers: {
                  "Content-Disposition": `attachment; filename="${path.split("/").pop()}.zip"`,
                  "Content-Type": "application/zip",
                },
              }),
            );
          });
          stream.on("error", () => {
            ssh.end();
            resolve(
              NextResponse.json({ error: "Zip stream error" }, { status: 500 }),
            );
          });
        },
      );
    });
  }

  return new Promise<NextResponse>((resolve) => {
    ssh.sftp((err, sftp) => {
      if (err) {
        ssh.end();
        return resolve(
          NextResponse.json({ error: "SFTP failed" }, { status: 500 }),
        );
      }

      if (download || view) {
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(path);
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("close", () => {
          ssh.end();
          const filename = path.split("/").pop() || "file";
          const content = Buffer.concat(chunks);
          if (view) {
            resolve(
              new NextResponse(content, {
                headers: {
                  "Content-Type": "text/plain; charset=utf-8",
                  "X-Filename": filename,
                },
              }),
            );
          } else {
            resolve(
              new NextResponse(content, {
                headers: {
                  "Content-Disposition": `attachment; filename="${filename}"`,
                  "Content-Type": "application/octet-stream",
                },
              }),
            );
          }
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
          const files = list
            .map((f) => ({
              name: f.filename,
              type: f.attrs.isDirectory() ? "dir" : "file",
              size: f.attrs.size,
              modified: new Date(f.attrs.mtime! * 1000)
                .toISOString()
                .split("T")[0],
              viewable: !f.attrs.isDirectory() && isTextFile(f.filename),
            }))
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          resolve(NextResponse.json({ files, path }));
        });
      }
    });
  });
}

export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const destPath = safePath((formData.get("path") as string) || "");
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ssh = await getSSHClient();
  return new Promise<NextResponse>((resolve) => {
    ssh.sftp((err, sftp) => {
      if (err) {
        ssh.end();
        return resolve(
          NextResponse.json({ error: "SFTP failed" }, { status: 500 }),
        );
      }
      const writeStream = sftp.createWriteStream(`${destPath}/${file.name}`);
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

// Write file content — called when user saves edits from the web editor
export async function PUT(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path, content } = await request.json();
  if (!path || content === undefined)
    return NextResponse.json(
      { error: "Missing path or content" },
      { status: 400 },
    );

  const destPath = safePath(path);
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
      writeStream.end(Buffer.from(content, "utf8"));
    });
  });
}
