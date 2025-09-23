"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function loginAction(
  prevState: { error: string } | null,
  formData: FormData
) {
  const key = formData.get("key") as string;
  const pass = formData.get("pass") as string;
  if (!key || !pass) return { error: "Missing key or pass" };
  const storedHash = await redis.get(key);
  if (!storedHash) return { error: "Invalid or expired key" };
  const isValid = await bcrypt.compare(pass, storedHash);
  if (!isValid) return { error: "Invalid pass" };
  await redis.del(key);
  const token = jwt.sign({ user: "admin" }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  const cookieStore = await cookies();
  cookieStore.set("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
  });
  redirect("/console");
}
