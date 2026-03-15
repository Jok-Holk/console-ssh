import { NextRequest, NextResponse } from "next/server";
import {
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join, basename, dirname } from "path";
import { execSync } from "child_process";
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

// Safe path — prevent directory traversal outside allowed roots
const ALLOWED_ROOTS = [
  "/root",
  "/home",
  "/var/log",
  "/etc/nginx",
  "/opt",
  "/srv",
];
const BLOCKED_FILES = ["/etc/shadow", "/etc/gshadow", "/etc/sudoers"];

function safePath(p: string): string {
  const user = process.env.VPS_USER ?? "root";
  const defaultBase = user === "root" ? "/root" : `/home/${user}`;
  if (!p || !p.startsWith("/")) return defaultBase;
  // Strip traversal
  const normalized =
    p
      .replace(/\/+/g, "/")
      .split("/")
      .reduce((acc: string[], seg) => {
        if (seg === ".." || seg === ".") return acc;
        return [...acc, seg];
      }, [])
      .join("/") || "/";
  return normalized || defaultBase;
}

function isPathAllowed(p: string): boolean {
  if (BLOCKED_FILES.includes(p)) return false;
  return ALLOWED_ROOTS.some((root) => p === root || p.startsWith(root + "/"));
}

const TEXT_EXTS = new Set([
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
  "mjs",
  "cjs",
  "astro",
  "vue",
  "svelte",
]);

function isViewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (
    TEXT_EXTS.has(ext) ||
    [
      "dockerfile",
      "makefile",
      "rakefile",
      "procfile",
      "readme",
      "license",
      "changelog",
      "nginx",
    ].includes(name.toLowerCase())
  );
}

// GET — list directory, view file, download file, zip folder
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const p = safePath(url.searchParams.get("path") ?? "");
  const view = url.searchParams.get("view") === "1";
  const dl = url.searchParams.get("download") === "1";
  const zip = url.searchParams.get("zip") === "1";

  if (!existsSync(p))
    return NextResponse.json({ error: "Path not found" }, { status: 404 });

  if (!isPathAllowed(p))
    return NextResponse.json(
      { error: "Access denied — path outside allowed roots" },
      { status: 403 },
    );

  // Zip folder
  if (zip) {
    try {
      const name = basename(p);
      const parent = dirname(p);
      const zipBuf = execSync(
        `cd "${parent}" && zip -r - "${name}" 2>/dev/null`,
        {
          maxBuffer: 100 * 1024 * 1024,
        },
      );
      return new NextResponse(new Uint8Array(zipBuf), {
        headers: {
          "Content-Disposition": `attachment; filename="${name}.zip"`,
          "Content-Type": "application/zip",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "zip failed — install zip: apt install zip" },
        { status: 500 },
      );
    }
  }

  const stat = statSync(p);

  // View / download file
  if (stat.isFile()) {
    if (view) {
      try {
        const content = readFileSync(p, "utf8");
        return new Response(content, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch {
        return NextResponse.json(
          { error: "Cannot read file" },
          { status: 500 },
        );
      }
    }
    if (dl) {
      const buf = readFileSync(p);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Disposition": `attachment; filename="${basename(p)}"`,
          "Content-Type": "application/octet-stream",
        },
      });
    }
  }

  // List directory
  if (stat.isDirectory()) {
    try {
      const entries = readdirSync(p, { withFileTypes: true })
        .map((e) => {
          let size = 0;
          let modified = "";
          try {
            const s = statSync(join(p, e.name));
            size = s.size;
            modified = s.mtime.toISOString().slice(0, 10);
          } catch {}
          return {
            name: e.name,
            type: e.isDirectory() ? "dir" : "file",
            size,
            modified,
            viewable: e.isFile() && isViewable(e.name),
          };
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return NextResponse.json({ path: p, files: entries });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown path type" }, { status: 400 });
}

// POST — upload file
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const dest = safePath((form.get("path") as string) ?? "");

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(dest, file.name), buf);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT — write file content (editor save)
export async function PUT(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: p, content } = await request.json();
  const safe = safePath(p);

  if (typeof content !== "string")
    return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    writeFileSync(safe, content, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE — delete file or directory
export async function DELETE(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const p = safePath(url.searchParams.get("path") ?? "");
  const type = url.searchParams.get("type");

  // Safety — never delete root or home dirs
  const PROTECTED = [
    "/root",
    "/home",
    "/etc",
    "/var",
    "/usr",
    "/bin",
    "/sys",
    "/proc",
  ];
  if (PROTECTED.includes(p))
    return NextResponse.json({ error: "Protected path" }, { status: 403 });

  if (!existsSync(p))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (type === "dir") {
      execSync(`rm -rf "${p}"`, { timeout: 10000 });
    } else {
      unlinkSync(p);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
