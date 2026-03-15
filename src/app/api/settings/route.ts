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

// Health check each module
async function healthCheck() {
  type HS = "ok" | "empty" | "not_running" | "not_installed" | "misconfigured";
  type HR = { ok: boolean; status: HS; reason?: string };
  const checks: Record<string, HR> = {};

  const liveEnv = existsSync(ENV_PATH)
    ? parseEnv(readFileSync(ENV_PATH, "utf8"))
    : {};
  const getEnv = (key: string) => liveEnv[key] ?? process.env[key] ?? "";

  // SSH
  const keyPath = getEnv("VPS_PRIVATE_KEY_PATH");
  if (!keyPath)
    checks.ssh = {
      ok: false,
      status: "misconfigured",
      reason: "VPS_PRIVATE_KEY_PATH not set",
    };
  else if (!existsSync(keyPath))
    checks.ssh = {
      ok: false,
      status: "misconfigured",
      reason: `Key file not found: ${keyPath}`,
    };
  else checks.ssh = { ok: true, status: "ok" };

  // Redis — always quit/disconnect to avoid leaks
  {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(getEnv("REDIS_URL") || "redis://localhost:6380", {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      await redis.ping();
      checks.redis = { ok: true, status: "ok" };
    } catch (e) {
      const msg = String(e);
      checks.redis = {
        ok: false,
        status: msg.includes("ECONNREFUSED") ? "not_running" : "misconfigured",
        reason: msg.includes("ECONNREFUSED") ? "Redis not running" : msg,
      };
    } finally {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    }
  }

  // CV service
  const cvUrl = getEnv("CV_SERVICE_URL");
  if (!cvUrl) {
    checks.cv = {
      ok: false,
      status: "misconfigured",
      reason: "CV_SERVICE_URL not set",
    };
  } else {
    try {
      const res = await fetch(`${cvUrl}/api/md?lang=vi`, {
        signal: AbortSignal.timeout(3000),
      });
      checks.cv = res.ok
        ? { ok: true, status: "ok" }
        : { ok: false, status: "not_running", reason: `HTTP ${res.status}` };
    } catch {
      checks.cv = {
        ok: false,
        status: "not_running",
        reason: "Service unreachable",
      };
    }
  }

  // Docker: not_installed vs not_running vs empty vs ok
  const hasDocker = (() => {
    try {
      execSync("which docker", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();
  if (!hasDocker) {
    checks.docker = {
      ok: false,
      status: "not_installed",
      reason: "Docker not installed",
    };
  } else {
    try {
      execSync("docker version --format '{{.Server.Version}}'", {
        timeout: 3000,
        stdio: "pipe",
      });
      const ps = execSync("docker ps -q", {
        timeout: 3000,
        stdio: "pipe",
        encoding: "utf8",
      }).trim();
      checks.docker = {
        ok: true,
        status: ps ? "ok" : "empty",
        reason: ps ? undefined : "No running containers",
      };
    } catch {
      checks.docker = {
        ok: false,
        status: "not_running",
        reason: "Docker daemon not running",
      };
    }
  }

  // PM2: not_installed vs empty vs ok
  const hasPm2 = (() => {
    try {
      execSync("which pm2", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();
  if (!hasPm2) {
    checks.pm2 = {
      ok: false,
      status: "not_installed",
      reason: "PM2 not installed",
    };
  } else {
    try {
      const list = execSync("pm2 jlist", {
        timeout: 3000,
        stdio: "pipe",
        encoding: "utf8",
      });
      const procs = JSON.parse(list) as unknown[];
      checks.pm2 = {
        ok: true,
        status: procs.length > 0 ? "ok" : "empty",
        reason: procs.length === 0 ? "No PM2 processes" : undefined,
      };
    } catch {
      checks.pm2 = {
        ok: false,
        status: "not_running",
        reason: "PM2 not responding",
      };
    }
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
    const appDir = process.env.APP_DIR ?? process.cwd();
    const pm2Name = process.env.PM2_APP_NAME ?? "app";
    const logFile = join(appDir, ".rebuild.log");
    const { spawn } = await import("child_process");

    // Write start marker — UI polls /api/auth/token until server back online
    writeFileSync(
      logFile,
      `[${new Date().toISOString()}] BUILD STARTED\n`,
      "utf8",
    );

    // Run build + reload, pipe output to log file
    spawn(
      "sh",
      [
        "-c",
        `cd ${appDir} && npm run build >> .rebuild.log 2>&1 && echo "BUILD OK" >> .rebuild.log && pm2 reload ${pm2Name} --update-env >> .rebuild.log 2>&1 || echo "BUILD FAILED" >> .rebuild.log`,
      ],
      { detached: true, stdio: "ignore" },
    ).unref();

    return NextResponse.json({
      success: true,
      rebuilding: true,
      logFile: ".rebuild.log",
    });
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

// GET /api/settings/rebuild-status — read last rebuild log
export async function GET_REBUILD(request: NextRequest) {
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
