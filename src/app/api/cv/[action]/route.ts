import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

function authCheck(request: NextRequest): boolean {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  // export is public — no auth required
  const isPublic = action === "export";
  if (!isPublic && !authCheck(request))
    return new Response("Unauthorized", { status: 401 });
  const cvUrl = process.env.CV_SERVICE_URL ?? "http://localhost:4321";
  const url = new URL(request.url);
  const res = await fetch(`${cvUrl}/api/${action}${url.search}`);
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!authCheck(request)) return new Response("Unauthorized", { status: 401 });
  const cvUrl = process.env.CV_SERVICE_URL ?? "http://localhost:4321";
  const url = new URL(request.url);
  const body = await request.arrayBuffer();
  const res = await fetch(`${cvUrl}/api/${action}${url.search}`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
    },
    body,
  });
  const resBody = await res.arrayBuffer();
  return new Response(resBody, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
