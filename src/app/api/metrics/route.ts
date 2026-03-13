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

function exec(ssh: Client, cmd: string): Promise<string> {
  return new Promise((resolve) => {
    ssh.exec(cmd, (err, stream) => {
      if (err) return resolve("");
      let out = "";
      stream.on("data", (d: Buffer) => (out += d.toString()));
      stream.stderr.on("data", () => {});
      stream.on("close", () => resolve(out.trim()));
    });
  });
}

async function collectMetrics(ssh: Client) {
  const [cpuRaw, memRaw, dfRaw, uptimeRaw, netRaw, topRaw, diskIoRaw] =
    await Promise.all([
      // CPU usage via /proc/stat
      exec(
        ssh,
        `awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat && sleep 0.5 && awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat`,
      ),
      // Memory
      exec(ssh, "cat /proc/meminfo"),
      // Disk usage
      exec(ssh, "df -BM / | tail -1"),
      // Uptime + load
      exec(ssh, "cat /proc/uptime && cat /proc/loadavg"),
      // Network stats
      exec(ssh, "cat /proc/net/dev"),
      // Top processes by CPU
      exec(ssh, "ps aux --sort=-%cpu | head -8 | tail -7"),
      // Disk IO
      exec(ssh, "cat /proc/diskstats"),
    ]);

  // CPU calculation
  let cpu = 0;
  const cpuLines = cpuRaw.split("\n").filter(Boolean);
  if (cpuLines.length >= 2) {
    const [t1, idle1] = cpuLines[0].split(" ").map(Number);
    const [t2, idle2] = cpuLines[1].split(" ").map(Number);
    const totalDiff = t2 - t1;
    const idleDiff = idle2 - idle1;
    cpu =
      totalDiff > 0
        ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100)
        : 0;
  }

  // Memory parsing
  const memLines: Record<string, number> = {};
  memRaw.split("\n").forEach((line) => {
    const [key, val] = line.split(":");
    if (key && val) memLines[key.trim()] = parseInt(val.trim());
  });
  const memTotal = memLines["MemTotal"] ?? 0;
  const memAvail = memLines["MemAvailable"] ?? 0;
  const memUsed = memTotal - memAvail;
  const memBuffers = memLines["Buffers"] ?? 0;
  const memCached = (memLines["Cached"] ?? 0) + (memLines["SReclaimable"] ?? 0);
  const memFree = memLines["MemFree"] ?? 0;

  // Disk
  const dfParts = dfRaw.split(/\s+/);
  const diskTotal = parseInt(dfParts[1] ?? "0");
  const diskUsed = parseInt(dfParts[2] ?? "0");
  const diskFree = parseInt(dfParts[3] ?? "0");
  const diskPct = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;

  // Uptime
  const [uptimeSec] = uptimeRaw.split("\n")[0]?.split(" ") ?? ["0"];
  const uptimeSeconds = parseFloat(uptimeSec);
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const mins = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeStr =
    days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;

  // Load average
  const loadLine = uptimeRaw.split("\n")[1] ?? "";
  const [load1, load5, load15] = loadLine.split(" ").slice(0, 3);

  // Network — find main interface (not lo)
  let rxBytes = 0,
    txBytes = 0;
  netRaw.split("\n").forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const iface = parts[0]?.replace(":", "");
    if (
      iface &&
      iface !== "lo" &&
      !iface.startsWith("docker") &&
      !iface.startsWith("br-")
    ) {
      rxBytes += parseInt(parts[1] ?? "0");
      txBytes += parseInt(parts[9] ?? "0");
    }
  });

  // Top processes
  const processes = topRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const p = line.trim().split(/\s+/);
      return {
        pid: p[1],
        user: p[0],
        cpu: parseFloat(p[2] ?? "0"),
        mem: parseFloat(p[3] ?? "0"),
        cmd:
          p.slice(10).join(" ").split("/").pop()?.slice(0, 30) ?? p[10] ?? "",
      };
    });

  return {
    cpu,
    ram: {
      total: memTotal,
      used: memUsed,
      free: memFree,
      buffers: memBuffers,
      cached: memCached,
      available: memAvail,
      pct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    },
    disk: {
      total: diskTotal,
      used: diskUsed,
      free: diskFree,
      pct: diskPct,
    },
    uptime: uptimeStr,
    load: { "1m": load1, "5m": load5, "15m": load15 },
    network: { rx: rxBytes, tx: txBytes },
    processes,
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
  let ssh: Client | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        ssh = await getSSHClient();
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "SSH failed" })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      const interval = setInterval(async () => {
        try {
          const metrics = await collectMetrics(ssh!);
          send(metrics);
        } catch {
          // keep trying
        }
      }, 3000);

      // Send first immediately
      try {
        const metrics = await collectMetrics(ssh);
        send(metrics);
      } catch {}

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        ssh?.end();
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
