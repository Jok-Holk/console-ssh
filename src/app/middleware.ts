import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
      // Token invalid or expired — clear cookie and redirect
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete("authToken");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/console/:path*", "/dashboard/:path*"],
};
