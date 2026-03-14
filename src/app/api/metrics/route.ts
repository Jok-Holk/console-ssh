import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

function readProc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function execCmd(cmd: string): string {
  try {
    const { execSync } = require("child_process");
    return execSync(cmd, { encoding: "utf8", timeout: 3000 });
  } catch {
    return "";
  }
}

interface NetSample {
  rx: number;
  tx: number;
  ts: number;
}
interface DiskSample {
  reads: number;
  writes: number;
  readBytes: number;
  writeBytes: number;
  ts: number;
}

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

// Sample disk I/O from /proc/diskstats — pick main disk (sda/vda/nvme)
function sampleDisk(): DiskSample {
  let reads = 0,
    writes = 0,
    readBytes = 0,
    writeBytes = 0;
  readProc("/proc/diskstats")
    .split("\n")
    .forEach((line) => {
      const p = line.trim().split(/\s+/);
      const name = p[2] ?? "";
      // Only root-level block devices, skip partitions (sda1, vda1 etc)
      if (!/^(sda|vda|nvme0n1|xvda|hda)$/.test(name)) return;
      reads += parseInt(p[3] ?? "0") || 0; // reads completed
      readBytes += parseInt(p[5] ?? "0") || 0; // sectors read (* 512)
      writes += parseInt(p[7] ?? "0") || 0; // writes completed
      writeBytes += parseInt(p[9] ?? "0") || 0; // sectors written (* 512)
    });
  return {
    reads,
    writes,
    readBytes: readBytes * 512,
    writeBytes: writeBytes * 512,
    ts: Date.now(),
  };
}

// Get CPU frequency info
function getCpuInfo() {
  const cpuinfo = readProc("/proc/cpuinfo");
  const freqLine = cpuinfo.match(/cpu MHz\s*:\s*([\d.]+)/);
  const modelLine = cpuinfo.match(/model name\s*:\s*(.+)/);
  const coresLine = cpuinfo.match(/cpu cores\s*:\s*(\d+)/);
  const threadMatches = cpuinfo.match(/^processor\s*:/gm);

  const freqMhz = freqLine ? parseFloat(freqLine[1]) : 0;
  const model = modelLine ? modelLine[1].trim() : "Unknown";
  const cores = coresLine ? parseInt(coresLine[1]) : 1;
  const threads = threadMatches ? threadMatches.length : cores;

  // Try scaling_cur_freq for realtime freq
  const scalingFreq = readProc(
    "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq",
  ).trim();
  const scalingMax = readProc(
    "/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq",
  ).trim();
  const curFreqMhz = scalingFreq
    ? Math.round(parseInt(scalingFreq) / 1000)
    : Math.round(freqMhz);
  const maxFreqMhz = scalingMax
    ? Math.round(parseInt(scalingMax) / 1000)
    : curFreqMhz;

  return { model, cores, threads, curFreqMhz, maxFreqMhz };
}

async function collectMetrics(
  prevNet: NetSample,
  prevDisk: DiskSample,
): Promise<{ data: object; nextNet: NetSample; nextDisk: DiskSample }> {
  // CPU two-sample diff
  const stat1 = readProc("/proc/stat")
    .split("\n")[0]
    .split(/\s+/)
    .slice(1)
    .map(Number);
  const disk1 = sampleDisk();
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

  // CPU per-core usage
  const cpuLines1 = readProc("/proc/stat")
    .split("\n")
    .filter((l) => /^cpu\d/.test(l));
  const cpuLines2: string[] = [];
  await new Promise((r) => setTimeout(r, 200));
  readProc("/proc/stat")
    .split("\n")
    .filter((l) => /^cpu\d/.test(l))
    .forEach((l) => cpuLines2.push(l));

  const cpuInfo = getCpuInfo();

  // Memory
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
  const swapTotal = memLines["SwapTotal"] ?? 0;
  const swapUsed = (memLines["SwapTotal"] ?? 0) - (memLines["SwapFree"] ?? 0);

  // Disk usage
  const dfParts = execCmd("df -BM / | tail -1").split(/\s+/);
  const diskTotal = parseInt(dfParts[1] ?? "0");
  const diskUsed = parseInt(dfParts[2] ?? "0");
  const diskFree = parseInt(dfParts[3] ?? "0");

  // Disk I/O rate
  const disk2 = sampleDisk();
  const diskElapsed = Math.max((disk2.ts - disk1.ts) / 1000, 0.1);
  const diskReadSec = Math.round(
    Math.max(disk2.readBytes - disk1.readBytes, 0) / diskElapsed,
  );
  const diskWriteSec = Math.round(
    Math.max(disk2.writeBytes - disk1.writeBytes, 0) / diskElapsed,
  );

  // Uptime + load
  const [uptimeSec] = readProc("/proc/uptime").split(" ");
  const secs = parseFloat(uptimeSec);
  const days = Math.floor(secs / 86400);
  const hrs = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const uptimeStr = days > 0 ? `${days}d ${hrs}h ${mins}m` : `${hrs}h ${mins}m`;
  const [l1, l5, l15] = readProc("/proc/loadavg").split(" ");

  // Network bandwidth
  const curNet = sampleNet();
  const netElapsed = Math.max((curNet.ts - prevNet.ts) / 1000, 0.1);
  const rxSec = Math.round(Math.max(curNet.rx - prevNet.rx, 0) / netElapsed);
  const txSec = Math.round(Math.max(curNet.tx - prevNet.tx, 0) / netElapsed);

  return {
    nextNet: curNet,
    nextDisk: disk2,
    data: {
      cpu,
      cpuInfo,
      ram: {
        total: memTotal,
        used: memUsed,
        free: memAvail,
        buffers: memBuffers,
        cached: memCached,
        pct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
        swapTotal,
        swapUsed,
        swapPct: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskFree,
        pct: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
        readSec: diskReadSec,
        writeSec: diskWriteSec,
      },
      uptime: uptimeStr,
      load: { "1m": l1, "5m": l5, "15m": l15 },
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
  let prevDisk = sampleDisk();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
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

      try {
        const result = await collectMetrics(prevNet, prevDisk);
        prevNet = result.nextNet;
        prevDisk = result.nextDisk;
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
          const result = await collectMetrics(prevNet, prevDisk);
          prevNet = result.nextNet;
          prevDisk = result.nextDisk;
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
