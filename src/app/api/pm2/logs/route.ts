import { NextRequest } from "next/server";
import { Client } from "ssh2";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

function getSSHClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ssh = new Client();
    ssh
      .on("ready", () => resolve(ssh))
      .on("error", reject)
      .connect({
        host: process.env.VPS_HOST,
        port: 22,
        username: process.env.VPS_USER,
        privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
      });
  });
}

// GET /api/pm2/logs?name=console-ssh&lines=50
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
  const lines = Math.min(parseInt(url.searchParams.get("lines") ?? "100"), 500);

  if (!name) return new Response("Missing name", { status: 400 });

  const ssh = await getSSHClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ line: data })}\n\n`),
        );
      };

      ssh.exec(
        `pm2 logs ${name} --lines ${lines} --nostream 2>&1`,
        (err, s) => {
          if (err) {
            send(`Error: ${err.message}`);
            controller.close();
            ssh.end();
            return;
          }
          s.on("data", (d: Buffer) => {
            d.toString().split("\n").filter(Boolean).forEach(send);
          });
          s.stderr.on("data", (d: Buffer) => {
            d.toString().split("\n").filter(Boolean).forEach(send);
          });
          s.on("close", () => {
            controller.close();
            ssh.end();
          });
        },
      );

      request.signal.addEventListener("abort", () => {
        ssh.end();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
