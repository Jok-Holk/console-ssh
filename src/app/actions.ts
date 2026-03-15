"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function loginAction(
  prevState: { error: string } | null,
  formData: FormData,
) {
  const key = formData.get("key") as string;
  const pass = formData.get("pass") as string;
  if (!key || !pass) return { error: "Missing key or pass" };

  // Lazy init Redis — don't crash on module load if REDIS_URL missing
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return { error: "Server not configured (REDIS_URL missing)" };

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret)
    return { error: "Server not configured (JWT_SECRET missing)" };

  let redis;
  try {
    const Redis = (await import("ioredis")).default;
    redis = new Redis(redisUrl, { lazyConnect: false, connectTimeout: 3000 });
  } catch {
    return { error: "Cannot connect to Redis" };
  }

  try {
    const storedHash = await redis.get(key);
    if (!storedHash) return { error: "Invalid or expired key" };

    const isValid = await bcrypt.compare(pass, storedHash);
    if (!isValid) return { error: "Invalid pass" };

    await redis.del(key);
  } finally {
    redis.disconnect();
  }

  const token = jwt.sign({ user: "admin" }, jwtSecret, { expiresIn: "1h" });

  const cookieStore = await cookies();
  cookieStore.set("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
    sameSite: "lax",
    path: "/",
  });

  redirect("/dashboard");
}
