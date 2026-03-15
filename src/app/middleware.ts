import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

// Startup logic runs via instrumentation.ts (Node.js runtime only)
// Middleware runs on edge — no Node.js APIs here

function isSetupMode(): boolean {
  // In edge runtime we can only read process.env embedded at build time
  // Setup mode is detected by absence of PUBLIC_KEY_ED25519
  return !process.env.PUBLIC_KEY_ED25519;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: setup page, setup-login API, static assets
  if (
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth/setup-login") ||
    pathname.startsWith("/api/auth/nonce") ||
    pathname.startsWith("/api/auth/verify") ||
    pathname.startsWith("/api/auth/token") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Settings API always allowed (needed to configure the app)
  if (pathname.startsWith("/api/settings")) {
    return NextResponse.next();
  }

  // Protected routes
  const isProtected =
    pathname.startsWith("/console") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/");

  if (isProtected) {
    const token = request.cookies.get("authToken")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) return NextResponse.redirect(new URL("/", request.url));
      jwt.verify(token, secret);
    } catch {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete("authToken");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/console",
    "/console/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/api/:path*",
    "/setup",
  ],
};
