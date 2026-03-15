/**
 * src/lib/startup.ts
 * Runs once on server boot via instrumentation.ts.
 *
 * Responsibilities:
 * 1. Create .env from scratch if it doesn't exist
 * 2. Fill in any missing keys with sensible defaults
 * 3. Auto-generate JWT_SECRET
 * 4. Generate one-time setup password if PUBLIC_KEY_ED25519 not set
 * 5. Disable setup password once public key is configured
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomBytes, createHash } from "crypto";
import { join, resolve } from "path";

const ENV_PATH = join(process.cwd(), ".env");

// ── Env helpers ───────────────────────────────────────────────────────────────

export function parseEnv(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
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

function writeEnvKey(key: string, value: string): void {
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  if (new RegExp(`^${key}=`, "m").test(current)) {
    writeFileSync(
      ENV_PATH,
      current.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`),
      "utf8",
    );
  } else {
    const sep = current.length && !current.endsWith("\n") ? "\n" : "";
    writeFileSync(ENV_PATH, current + sep + `${key}=${value}\n`, "utf8");
  }
  process.env[key] = value;
}

function removeEnvKey(key: string): void {
  if (!existsSync(ENV_PATH)) return;
  const updated = readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => !l.startsWith(`${key}=`))
    .join("\n");
  writeFileSync(ENV_PATH, updated, "utf8");
  delete process.env[key];
}

// ── Auto-detect Redis port ────────────────────────────────────────────────────
function detectRedisUrl(): string {
  const { execSync } =
    require("child_process") as typeof import("child_process");
  // Common Redis ports to probe
  const candidates = [6379, 6380, 6381];
  for (const port of candidates) {
    try {
      // Try connecting with redis-cli
      execSync(`redis-cli -p ${port} ping`, { stdio: "pipe", timeout: 2000 });
      console.log(`[startup] Redis detected on port ${port}`);
      return `redis://localhost:${port}`;
    } catch {}
  }
  // Fallback — return standard port even if not running yet
  console.warn(
    "[startup] Redis not detected on common ports — defaulting to 6379",
  );
  return "redis://localhost:6379";
}

// ── Default .env template ─────────────────────────────────────────────────────

function createDefaultEnv(): void {
  const cwd = process.cwd();
  const defaultKeyPath = join(cwd, "keys", "id_rsa");

  const template = `# VPS Manager — auto-generated on first run
# Edit via Settings GUI or directly here, then restart.

# ── Core ──────────────────────────────────────────────────
VPS_HOST=127.0.0.1
VPS_USER=root
VPS_PRIVATE_KEY_PATH=./keys/id_rsa
REDIS_URL=${detectRedisUrl()}

# ── Auth (auto-generated) ─────────────────────────────────
JWT_SECRET=${randomBytes(48).toString("hex")}

# ── Public key for Electron app auth ──────────────────────
# Paste your Ed25519 public key here after first login
PUBLIC_KEY_ED25519=

# ── Public vars (embedded at build time) ──────────────────
NEXT_PUBLIC_VPS_HOST=
NEXT_PUBLIC_VPS_USER=root
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# ── Deploy config ─────────────────────────────────────────
APP_DIR=${cwd}
PM2_APP_NAME=vps-manager
GIT_REMOTE=origin
GIT_BRANCH=main

# ── CV Service (optional) ─────────────────────────────────
CV_SERVICE_URL=http://localhost:4321

# ── Modules (true/false) ──────────────────────────────────
NEXT_PUBLIC_ENABLE_METRICS=true
NEXT_PUBLIC_ENABLE_DOCKER=false
NEXT_PUBLIC_ENABLE_PM2=true
NEXT_PUBLIC_ENABLE_FILES=true
NEXT_PUBLIC_ENABLE_CV=false

# ── Quick Access shortcuts ────────────────────────────────
NEXT_PUBLIC_QA_TERMINAL=true
NEXT_PUBLIC_QA_MONITOR=true
NEXT_PUBLIC_QA_DOCKER=true
NEXT_PUBLIC_QA_PM2=true
NEXT_PUBLIC_QA_FILES=true
NEXT_PUBLIC_QA_CV=true
NEXT_PUBLIC_QA_COLS=3
`;

  writeFileSync(ENV_PATH, template, "utf8");
  console.log("[startup] Created .env with defaults at", ENV_PATH);

  // Load into process.env
  const parsed = parseEnv(template);
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

// ── Main startup ──────────────────────────────────────────────────────────────

let startupDone = false;

export function runStartup(): { needsSetup: boolean; setupPassword?: string } {
  if (startupDone) {
    const env = existsSync(ENV_PATH)
      ? parseEnv(readFileSync(ENV_PATH, "utf8"))
      : {};
    return {
      needsSetup: !env.PUBLIC_KEY_ED25519,
      setupPassword: process.env._SETUP_PASSWORD_PLAIN,
    };
  }
  startupDone = true;

  // 1. Create .env if missing entirely
  if (!existsSync(ENV_PATH)) {
    createDefaultEnv();
  }

  const raw = readFileSync(ENV_PATH, "utf8");
  const env = parseEnv(raw);

  // 2. Ensure JWT_SECRET exists (may be blank in template if user wiped it)
  if (!env.JWT_SECRET || env.JWT_SECRET.trim() === "") {
    const secret = randomBytes(48).toString("hex");
    writeEnvKey("JWT_SECRET", secret);
    console.log("[startup] Generated JWT_SECRET");
  } else {
    process.env.JWT_SECRET = env.JWT_SECRET;
  }

  // 3. Ensure APP_DIR is set correctly
  if (!env.APP_DIR || env.APP_DIR.trim() === "") {
    writeEnvKey("APP_DIR", process.cwd());
  }

  // 4. Setup password logic
  const hasPubKey = !!(
    env.PUBLIC_KEY_ED25519?.trim() || process.env.PUBLIC_KEY_ED25519?.trim()
  );

  if (!hasPubKey) {
    // Generate setup password if not already set
    const existingHash =
      env.SETUP_PASSWORD_HASH || process.env.SETUP_PASSWORD_HASH;
    let plain: string;

    if (existingHash && process.env._SETUP_PASSWORD_PLAIN) {
      // Already generated this session
      plain = process.env._SETUP_PASSWORD_PLAIN;
    } else {
      plain = randomBytes(12).toString("base64url").slice(0, 16);
      const hash = createHash("sha256").update(plain).digest("hex");
      writeEnvKey("SETUP_PASSWORD_HASH", hash);
      process.env._SETUP_PASSWORD_PLAIN = plain;
    }

    console.log("\n" + "=".repeat(60));
    console.log("  VPS MANAGER — FIRST RUN");
    console.log("=".repeat(60));
    console.log("  .env created at:", ENV_PATH);
    console.log("  No Ed25519 key configured yet.");
    console.log("");
    console.log(`  SETUP PASSWORD: ${plain}`);
    console.log("");
    console.log("  1. Open the dashboard");
    console.log("  2. Enter the setup password above");
    console.log("  3. Go to Settings and fill in your server details");
    console.log("  4. Paste your PUBLIC_KEY_ED25519 from the Electron app");
    console.log("  5. Save — setup password will be disabled automatically");
    console.log("=".repeat(60) + "\n");

    return { needsSetup: true, setupPassword: plain };
  }

  // Public key exists — clean up setup password
  if (env.SETUP_PASSWORD_HASH) {
    removeEnvKey("SETUP_PASSWORD_HASH");
    delete process.env._SETUP_PASSWORD_PLAIN;
    console.log("[startup] Public key configured — setup password disabled");
  }

  return { needsSetup: false };
}

// ── Auth helpers (used by API routes) ────────────────────────────────────────

export function verifySetupPassword(input: string): boolean {
  const raw = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const hash =
    parseEnv(raw).SETUP_PASSWORD_HASH ?? process.env.SETUP_PASSWORD_HASH ?? "";
  if (!hash) return false;
  return createHash("sha256").update(input).digest("hex") === hash;
}

export function isSetupMode(): boolean {
  const raw = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const env = parseEnv(raw);
  return !(
    env.PUBLIC_KEY_ED25519?.trim() || process.env.PUBLIC_KEY_ED25519?.trim()
  );
}
