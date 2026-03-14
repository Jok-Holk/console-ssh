import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

// Keys that must exist for the app to function
const REQUIRED_KEYS = ["JWT_SECRET", "REDIS_URL", "VPS_HOST"];

function isFirstRun(): boolean {
  // Check if critical env vars are missing — indicates first run
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow setup page and API through without auth
  if (pathname.startsWith("/setup") || pathname.startsWith("/api/settings")) {
    return NextResponse.next();
  }

  // Redirect to setup on first run (missing critical env)
  if (isFirstRun() && !pathname.startsWith("/setup")) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const isProtected =
    pathname.startsWith("/console") || pathname.startsWith("/dashboard");

  if (isProtected) {
    const token = request.cookies.get("authToken")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
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
    "/setup",
  ],
};
