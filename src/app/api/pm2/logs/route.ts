import { NextRequest } from "next/server";
import { spawn } from "child_process";
import jwt from "jsonwebtoken";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const name =
    url.searchParams.get("name")?.replace(/[^a-zA-Z0-9_\-]/g, "") ?? "";
  const lines = Math.min(parseInt(url.searchParams.get("lines") ?? "150"), 500);

  if (!name) return new Response("Missing name", { status: 400 });

  // Check PM2 available
  const { execSync } = await import("child_process");
  try {
    execSync("which pm2", { stdio: "pipe" });
  } catch {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ line: "PM2 not installed" })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (line: string) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ line })}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // First dump existing lines
      const proc = spawn(
        "pm2",
        ["logs", name, "--lines", String(lines), "--nostream", "--raw"],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      proc.stdout.on("data", (d: Buffer) => {
        d.toString().split("\n").filter(Boolean).forEach(send);
      });
      proc.stderr.on("data", (d: Buffer) => {
        d.toString().split("\n").filter(Boolean).forEach(send);
      });
      proc.on("close", () => {
        if (!closed) {
          try {
            controller.close();
          } catch {}
        }
        closed = true;
      });
      proc.on("error", (e) => {
        send(`Error: ${e.message}`);
        if (!closed) {
          try {
            controller.close();
          } catch {}
        }
        closed = true;
      });

      request.signal.addEventListener("abort", () => {
        closed = true;
        proc.kill();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
