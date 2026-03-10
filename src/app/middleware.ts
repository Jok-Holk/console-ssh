import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export function middleware(request: NextRequest) {
  const protected_paths = ["/dashboard", "/console"];
  const isProtected = protected_paths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (isProtected) {
    const token = request.cookies.get("authToken")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/console/:path*"],
};
