import { NextResponse } from "next/server";
import crypto from "crypto";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function POST(request: Request) {
  const { nonce, signature } = await request.json();
  if (!nonce || !signature) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Check if the nonce still exists (unused, not expired)
  const exists = await redis.get(`nonce:${nonce}`);
  if (!exists) {
    return NextResponse.json(
      { error: "Invalid or expired nonce" },
      { status: 401 },
    );
  }

  // Remove nonce immediately — one-time use only.
  await redis.del(`nonce:${nonce}`);

  // Verify signature Ed25519
  const publicKeyPem = process.env.PUBLIC_KEY_ED25519!;
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const isValid = crypto.verify(
      null, // Ed25519 don't need hash algorithm
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

  const bcrypt = await import("bcryptjs");
  const pass = crypto.randomBytes(16).toString("base64url").slice(0, 16);
  const hash = await bcrypt.hash(pass, 10);
  const key = crypto.randomUUID();
  await redis.setex(key, 600, hash);

  return NextResponse.json({ key, pass });
}
