import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const API_KEY = process.env.API_KEY!;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pass = crypto.randomBytes(16).toString("base64url").slice(0, 16);
  const hash = await bcrypt.hash(pass, 10);
  const key = crypto.randomUUID();
  await redis.setex(key, 600, hash);
  return NextResponse.json({ key, pass });
}
