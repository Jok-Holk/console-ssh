import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const key = formData.get("key") as string;
  const pass = formData.get("pass") as string;
  if (!key || !pass) {
    return NextResponse.json({ error: "Missing key or pass" }, { status: 400 });
  }

  const storedHash = await redis.get(key);
  if (!storedHash) {
    return NextResponse.json(
      { error: "Invalid or expired key" },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(pass, storedHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid pass" }, { status: 401 });
  }

  await redis.del(key); // Xóa sau verify
  const token = jwt.sign({ user: "admin" }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
  });
  return response;
}
