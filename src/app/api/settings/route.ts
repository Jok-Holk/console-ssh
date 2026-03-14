import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import jwt from "jsonwebtoken";
import { execSync } from "child_process";

const ENV_PATH = join(process.cwd(), ".env");

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

// Parse .env file into key-value map
function parseEnv(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

// Serialize key-value map back to .env format
// Preserves comments from original file, updates existing keys, appends new ones
function serializeEnv(
  original: string,
  updates: Record<string, string>,
): string {
  const lines = original.split("\n");
  const written = new Set<string>();

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx < 0) return line;
    const key = trimmed.slice(0, idx).trim();
    if (key in updates) {
      written.add(key);
      const val = updates[key];
      // Wrap in quotes if value contains spaces or special chars
      const needsQuotes = /[\s#"'\\]/.test(val);
      return `${key}=${needsQuotes ? `"${val}"` : val}`;
    }
    return line;
  });

  // Append new keys not in original
  const newEntries = Object.entries(updates)
    .filter(([k]) => !written.has(k))
    .map(([k, v]) => {
      const needsQuotes = /[\s#"'\\]/.test(v);
      return `${k}=${needsQuotes ? `"${v}"` : v}`;
    });

  if (newEntries.length > 0) {
    updated.push("", "# Added by VPS Manager Settings", ...newEntries);
  }

  return updated.join("\n");
}

// Health check each module — reads .env file directly to get latest values
async function healthCheck() {
  const checks: Record<string, { ok: boolean; reason?: string }> = {};

  // Read latest .env values (not process.env which may be stale)
  const liveEnv = existsSync(ENV_PATH)
    ? parseEnv(readFileSync(ENV_PATH, "utf8"))
    : {};
  const getEnv = (key: string) => liveEnv[key] ?? process.env[key] ?? "";

  // SSH — check key file exists
  const keyPath = getEnv("VPS_PRIVATE_KEY_PATH");
  checks.ssh =
    keyPath && existsSync(keyPath)
      ? { ok: true }
      : {
          ok: false,
          reason: keyPath
            ? "Key file not found"
            : "VPS_PRIVATE_KEY_PATH not set",
        };

  // Redis
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(getEnv("REDIS_URL") || "redis://localhost:6380", {
      lazyConnect: true,
      connectTimeout: 2000,
    });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    checks.redis = { ok: true };
  } catch (e) {
    checks.redis = { ok: false, reason: String(e) };
  }

  // CV service — use live env value
  const cvUrl = getEnv("CV_SERVICE_URL");
  if (cvUrl) {
    try {
      const res = await fetch(`${cvUrl}/api/md?lang=vi`, {
        signal: AbortSignal.timeout(3000),
      });
      checks.cv = res.ok
        ? { ok: true }
        : { ok: false, reason: `HTTP ${res.status}` };
    } catch {
      checks.cv = { ok: false, reason: "Service unreachable" };
    }
  } else {
    checks.cv = { ok: false, reason: "CV_SERVICE_URL not set" };
  }

  // Docker
  try {
    execSync("docker version --format '{{.Server.Version}}'", {
      timeout: 3000,
      stdio: "pipe",
    });
    checks.docker = { ok: true };
  } catch {
    checks.docker = {
      ok: false,
      reason: "Docker not installed or not running",
    };
  }

  return checks;
}

// GET /api/settings — return current env config + health
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const env = parseEnv(raw);

  // Mask sensitive values
  const safe: Record<string, string> = {};
  const SENSITIVE = ["JWT_SECRET", "PUBLIC_KEY_ED25519"];
  for (const [k, v] of Object.entries(env)) {
    safe[k] = SENSITIVE.includes(k) ? (v ? "••••••••" : "") : v;
  }

  const health = await healthCheck();

  return NextResponse.json({ env: safe, health });
}

// POST /api/settings — update .env keys + optionally restart/rebuild pm2
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { updates, restart, rebuild } = (await request.json()) as {
    updates: Record<string, string>;
    restart?: string[];
    rebuild?: boolean;
  };

  if (!updates || typeof updates !== "object")
    return NextResponse.json({ error: "Invalid updates" }, { status: 400 });

  // Never allow overwriting JWT_SECRET via this API if it already exists
  const current = existsSync(ENV_PATH)
    ? parseEnv(readFileSync(ENV_PATH, "utf8"))
    : {};
  if ("JWT_SECRET" in updates && current.JWT_SECRET) {
    delete updates["JWT_SECRET"];
  }

  const original = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const newContent = serializeEnv(original, updates);
  writeFileSync(ENV_PATH, newContent, "utf8");

  // Check if any NEXT_PUBLIC vars changed — they need a full rebuild
  const hasPublicChanges = Object.keys(updates).some((k) =>
    k.startsWith("NEXT_PUBLIC_"),
  );
  const shouldRebuild = rebuild || hasPublicChanges;

  if (shouldRebuild) {
    // Run build + reload in background (detached so response can return)
    const appDir = process.env.APP_DIR ?? "/root/console-ssh";
    const pm2Name = process.env.PM2_APP_NAME ?? "console-ssh";
    const { spawn } = await import("child_process");
    spawn(
      "sh",
      [
        "-c",
        `cd ${appDir} && npm run build && pm2 reload ${pm2Name} --update-env`,
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    ).unref();
    return NextResponse.json({ success: true, rebuilding: true });
  }

  // Just restart — no NEXT_PUBLIC changes
  const restarted: string[] = [];
  if (restart?.length) {
    for (const name of restart) {
      try {
        execSync(`pm2 restart ${name} --update-env`, {
          timeout: 15000,
          stdio: "pipe",
        });
        restarted.push(name);
      } catch {}
    }
  }

  return NextResponse.json({ success: true, restarted, rebuilding: false });
}
