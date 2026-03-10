import { NextResponse } from "next/server";
import crypto from "crypto";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function GET() {
  const nonce = crypto.randomBytes(32).toString("hex");
  // Save nonce into Redis, TTL 60 seconds, one-time used
  await redis.setex(`nonce:${nonce}`, 60, "1");
  return NextResponse.json({ nonce });
}
