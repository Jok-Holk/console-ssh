import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

// Read /proc directly — no SSH needed since this app runs on the VPS itself
function readProc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function execSync(cmd: string): string {
  try {
    const { execSync: exec } = require("child_process");
    return exec(cmd, { encoding: "utf8", timeout: 3000 });
  } catch {
    return "";
  }
}

interface NetSample {
  rx: number;
  tx: number;
  ts: number;
}

// Sample network bytes from /proc/net/dev, skip loopback and virtual interfaces
function sampleNet(): NetSample {
  let rx = 0,
    tx = 0;
  readProc("/proc/net/dev")
    .split("\n")
    .forEach((line) => {
      const parts = line.trim().split(/\s+/);
      const iface = parts[0]?.replace(":", "");
      if (
        !iface ||
        iface === "lo" ||
        iface.startsWith("docker") ||
        iface.startsWith("br-") ||
        iface.startsWith("veth")
      )
        return;
      rx += parseInt(parts[1] ?? "0") || 0;
      tx += parseInt(parts[9] ?? "0") || 0;
    });
  return { rx, tx, ts: Date.now() };
}

async function collectMetrics(
  prevNet: NetSample,
): Promise<{ data: object; nextNet: NetSample }> {
  // CPU: two samples 500ms apart from /proc/stat
  const stat1 = readProc("/proc/stat")
    .split("\n")[0]
    .split(/\s+/)
    .slice(1)
    .map(Number);
  await new Promise((r) => setTimeout(r, 500));
  const stat2 = readProc("/proc/stat")
    .split("\n")[0]
    .split(/\s+/)
    .slice(1)
    .map(Number);

  const total1 = stat1.reduce((a, b) => a + b, 0);
  const idle1 = stat1[3] + (stat1[4] ?? 0);
  const total2 = stat2.reduce((a, b) => a + b, 0);
  const idle2 = stat2[3] + (stat2[4] ?? 0);
  const totalDiff = total2 - total1;
  const idleDiff = idle2 - idle1;
  const cpu =
    totalDiff > 0 ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100) : 0;

  // Memory from /proc/meminfo
  const memLines: Record<string, number> = {};
  readProc("/proc/meminfo")
    .split("\n")
    .forEach((line) => {
      const [k, v] = line.split(":");
      if (k && v) memLines[k.trim()] = parseInt(v.trim());
    });
  const memTotal = memLines["MemTotal"] ?? 0;
  const memAvail = memLines["MemAvailable"] ?? 0;
  const memUsed = memTotal - memAvail;
  const memBuffers = memLines["Buffers"] ?? 0;
  const memCached = (memLines["Cached"] ?? 0) + (memLines["SReclaimable"] ?? 0);

  // Disk
  const dfParts = execSync("df -BM / | tail -1").split(/\s+/);
  const diskTotal = parseInt(dfParts[1] ?? "0");
  const diskUsed = parseInt(dfParts[2] ?? "0");
  const diskFree = parseInt(dfParts[3] ?? "0");

  // Uptime + load
  const [uptimeSec] = readProc("/proc/uptime").split(" ");
  const secs = parseFloat(uptimeSec);
  const days = Math.floor(secs / 86400);
  const hrs = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const uptimeStr = days > 0 ? `${days}d ${hrs}h ${mins}m` : `${hrs}h ${mins}m`;
  const [l1, l5, l15] = readProc("/proc/loadavg").split(" ");

  // Network bandwidth — diff from previous sample
  const curNet = sampleNet();
  const elapsed = Math.max((curNet.ts - prevNet.ts) / 1000, 0.1); // seconds
  const rxSec = Math.round(Math.max(curNet.rx - prevNet.rx, 0) / elapsed);
  const txSec = Math.round(Math.max(curNet.tx - prevNet.tx, 0) / elapsed);

  return {
    nextNet: curNet,
    data: {
      cpu,
      ram: {
        total: memTotal,
        used: memUsed,
        free: memAvail,
        buffers: memBuffers,
        cached: memCached,
        pct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskFree,
        pct: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
      },
      uptime: uptimeStr,
      load: { "1m": l1, "5m": l5, "15m": l15 },
      // realtime bandwidth in bytes/sec
      network: { rxSec, txSec, rxTotal: curNet.rx, txTotal: curNet.tx },
    },
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let prevNet = sampleNet();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (data: object) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // First sample
      try {
        const result = await collectMetrics(prevNet);
        prevNet = result.nextNet;
        send(result.data);
      } catch (err) {
        send({ error: String(err) });
        closed = true;
        controller.close();
        return;
      }

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const result = await collectMetrics(prevNet);
          prevNet = result.nextNet;
          send(result.data);
        } catch {}
      }, 3000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
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
    },
  });
}
