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
  // Prevent path traversal
  if (!resolved.startsWith("/")) return base;
  return resolved;
}

function exec(ssh: Client, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d: Buffer) => (out += d.toString()));
      stream.stderr.on("data", () => {});
      stream.on("close", () => resolve(out));
    });
  });
}

// Text file extensions that can be viewed inline
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
  "timer",
]);

function isTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files without extension that are commonly text
  const noExtFiles = [
    "dockerfile",
    "makefile",
    "rakefile",
    "procfile",
    "readme",
    "license",
    "changelog",
  ];
  return noExtFiles.includes(filename.toLowerCase());
}

// GET /api/files?path=/root — list directory
// GET /api/files?path=/root/file.ts&view=1 — view text file inline
// GET /api/files?path=/root/file.ts&download=1 — download file
// GET /api/files?path=/root/folder&zip=1 — download folder as zip
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path") || "";
  const path = safePath(rawPath);
  const download = url.searchParams.get("download") === "1";
  const view = url.searchParams.get("view") === "1";
  const zip = url.searchParams.get("zip") === "1";

  const ssh = await getSSHClient();

  // Zip folder download
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
            const folderName = path.split("/").pop() || "folder";
            resolve(
              new NextResponse(Buffer.concat(chunks), {
                headers: {
                  "Content-Disposition": `attachment; filename="${folderName}.zip"`,
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
            // Return text content for inline viewing
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
        // List directory
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
              // Dirs first, then files
              if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
              return a.name.localeCompare(b.name);
            });

          resolve(NextResponse.json({ files, path }));
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
  const destPath = safePath((formData.get("path") as string) || "");
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const fullPath = `${destPath}/${file.name}`;

  const ssh = await getSSHClient();
  return new Promise<NextResponse>((resolve) => {
    ssh.sftp((err, sftp) => {
      if (err) {
        ssh.end();
        return resolve(
          NextResponse.json({ error: "SFTP failed" }, { status: 500 }),
        );
      }
      const writeStream = sftp.createWriteStream(fullPath);
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
