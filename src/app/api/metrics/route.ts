import { NextRequest } from "next/server";
import { Client } from "ssh2";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const ssh = new Client();

      function fetchMetrics() {
        const cmd = [
          `echo CPU:$(top -bn1 | grep "Cpu(s)" | awk '{print $2+$4}')`,
          `echo RAM:$(free | awk '/Mem/{printf "%.0f", $3/$2*100}')`,
          `echo DISK:$(df / | awk 'NR==2{printf "%.0f", $3/$2*100}')`,
          `echo UPTIME:$(uptime -p | sed 's/up //')`,
          `echo LOAD:$(uptime | awk -F'load average:' '{print $2}' | xargs)`,
        ].join(" && ");

        ssh.exec(cmd, (err, execStream) => {
          if (err) return;
          let data = "";
          execStream.on("data", (chunk: Buffer) => (data += chunk.toString()));
          execStream.on("close", () => {
            const parsed: Record<string, string> = {};
            data
              .trim()
              .split("\n")
              .forEach((line) => {
                const idx = line.indexOf(":");
                if (idx !== -1) {
                  parsed[line.slice(0, idx)] = line.slice(idx + 1).trim();
                }
              });
            const payload = JSON.stringify({
              cpu: Math.round(parseFloat(parsed.CPU ?? "0")),
              ram: Math.round(parseInt(parsed.RAM ?? "0")),
              disk: Math.round(parseInt(parsed.DISK ?? "0")),
              uptime: parsed.UPTIME ?? "—",
              load: parsed.LOAD ?? "—",
            });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          });
        });
      }

      ssh.on("ready", () => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 3000);
        // Khi client ngắt kết nối
        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          ssh.end();
          controller.close();
        });
      });

      ssh.on("error", () => controller.close());

      ssh.connect({
        host: process.env.VPS_HOST,
        port: 22,
        username: process.env.VPS_USER,
        privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
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
