import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { verifySetupPassword, isSetupMode } from "@/lib/startup";

// POST /api/auth/setup-login
// Used during first-run when no Ed25519 key is configured yet.
// Accepts the one-time setup password printed in PM2 logs.
export async function POST(request: NextRequest) {
  // Only works in setup mode
  if (!isSetupMode()) {
    return NextResponse.json(
      { error: "Setup mode not active. Use Electron app to log in." },
      { status: 403 },
    );
  }

  const { password } = await request.json();
  if (!password) {
    return NextResponse.json({ error: "Missing password" }, { status: 400 });
  }

  if (!verifySetupPassword(password)) {
    return NextResponse.json(
      { error: "Invalid setup password" },
      { status: 401 },
    );
  }

  // Generate JWT
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "JWT_SECRET not configured" },
      { status: 500 },
    );
  }

  const token = jwt.sign({ user: "admin", setup: true }, secret, {
    expiresIn: "4h",
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 14400,
    sameSite: "lax",
    path: "/",
  });

  return response;
}

// GET /api/auth/setup-login
// Returns whether setup mode is currently active
export async function GET() {
  return NextResponse.json({ setupMode: isSetupMode() });
}
