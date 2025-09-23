import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/console")) {
    const token = request.cookies.get("authToken")?.value;
    if (!token || !jwt.verify(token, process.env.JWT_SECRET!)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/console/:path*" };
