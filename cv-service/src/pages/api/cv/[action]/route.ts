import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

const CV_URL = process.env.CV_SERVICE_URL ?? "http://localhost:4321";

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

// Proxy all CV-related requests to cv-service
// Routes handled:
//   GET  /api/cv/render?lang=vi        → render MD as HTML
//   POST /api/cv/render                → render live MD
//   GET  /api/cv/export?lang=vi        → download PDF
//   POST /api/cv/export                → export live MD as PDF
//   GET  /api/cv/md?lang=vi            → read MD file
//   POST /api/cv/md                    → save MD file (auth required)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const { searchParams } = new URL(request.url);

  // Save/export require auth; render is public (for portfolio download link)
  if (action === "md" || action === "export") {
    if (!authCheck(request)) {
      // Allow unauthenticated export (for portfolio download link)
      if (action === "export") {
        // Pass through — cv-service handles it
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const upstream = `${CV_URL}/api/${action}?${searchParams.toString()}`;

  try {
    const res = await fetch(upstream);
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf")) {
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        status: res.status,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            res.headers.get("content-disposition") ??
            `attachment; filename="resume.pdf"`,
        },
      });
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { error: "CV service unreachable" },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;

  if (!authCheck(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const upstream = `${CV_URL}/api/${action}`;

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf")) {
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        status: res.status,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            res.headers.get("content-disposition") ??
            `attachment; filename="resume.pdf"`,
        },
      });
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { error: "CV service unreachable" },
      { status: 502 },
    );
  }
}
