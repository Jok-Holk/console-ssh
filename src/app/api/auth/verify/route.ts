import { NextResponse } from "next/server";
import crypto from "crypto";
import Redis from "ioredis";
import { readFileSync } from "fs";
import { join } from "path";

const redis = new Redis(process.env.REDIS_URL!);

// Next.js does not reliably inject multiline values from .env into process.env
// so we read the .env file directly at runtime
function getPublicKey(): string {
  const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  const match = raw.match(
    /^PUBLIC_KEY_ED25519=["']?([\s\S]+?)["']?\s*(?:#.*)?$/m,
  );
  if (!match) throw new Error("PUBLIC_KEY_ED25519 not found in .env");
  return match[1].replace(/\\n/g, "\n").trim();
}

export async function POST(request: Request) {
  const { nonce, signature, dryRun } = await request.json();

  if (!nonce || !signature) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Check nonce exists and is unused
  const exists = await redis.get(`nonce:${nonce}`);
  if (!exists) {
    return NextResponse.json(
      { error: "Invalid or expired nonce" },
      { status: 401 },
    );
  }

  // Remove nonce immediately — one-time use only (skip if dryRun)
  if (!dryRun) {
    await redis.del(`nonce:${nonce}`);
  }

  // Verify Ed25519 signature
  let publicKeyPem: string;
  try {
    publicKeyPem = getPublicKey();
  } catch {
    return NextResponse.json(
      { error: "Server not configured (missing public key)" },
      { status: 500 },
    );
  }

  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const isValid = crypto.verify(
      null,
      Buffer.from(nonce, "hex"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 401 });
  }

  // dryRun — just verify, don't issue credentials (used by Electron device auth check)
  if (dryRun) {
    return NextResponse.json({ ok: true });
  }

  // Issue one-time key+pass stored in Redis (TTL 10 min)
  const bcrypt = await import("bcryptjs");
  const pass = crypto.randomBytes(16).toString("base64url").slice(0, 16);
  const hash = await bcrypt.hash(pass, 10);
  const key = crypto.randomUUID();
  await redis.setex(key, 600, hash);

  return NextResponse.json({ key, pass });
}
