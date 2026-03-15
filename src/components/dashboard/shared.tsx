// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Metrics {
  cpu: number;
  cpuInfo: {
    model: string;
    cores: number;
    threads: number;
    curFreqMhz: number;
    maxFreqMhz: number;
  };
  ram: {
    total: number;
    used: number;
    free: number;
    buffers: number;
    cached: number;
    pct: number;
    swapTotal: number;
    swapUsed: number;
    swapPct: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    pct: number;
    readSec: number;
    writeSec: number;
  };
  uptime: string;
  load: { "1m": string; "5m": string; "15m": string };
  network: { rxSec: number; txSec: number; rxTotal: number; txTotal: number };
}
export interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}
export interface PM2Process {
  id: number;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptime: number | null;
  pid: number;
  mode: string;
}
export interface FileEntry {
  name: string;
  type: "dir" | "file";
  size: number;
  modified: string;
  viewable: boolean;
}
export interface HealthResult {
  ok: boolean;
  status?: string;
  reason?: string;
}

export type TabId =
  | "home"
  | "terminal"
  | "monitor"
  | "docker"
  | "pm2"
  | "files"
  | "cv"
  | "settings";
export type S = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  purple: string;
  cyan: string;
  green: string;
  red: string;
  amber: string;
  text: string;
  muted: string;
  mono: string;
};

// ─── Utils ────────────────────────────────────────────────────────────────────

export function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}

export function fmtKB(kb: number) {
  return fmt(kb * 1024);
}

export function fmtUptime(ms: number | null) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Shared micro-components ──────────────────────────────────────────────────

export function Bar({
  pct,
  color = "#8060d0",
}: {
  pct: number;
  color?: string;
}) {
  const c = pct > 85 ? "#f87171" : pct > 65 ? "#f59e0b" : color;
  return (
    <div
      style={{
        height: 5,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          background: c,
          borderRadius: 3,
          transition: "width 0.8s ease",
        }}
      />
    </div>
  );
}

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 100,
    h = 34;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ flexShrink: 0 }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}

export function NetworkChart({
  rxData,
  txData,
}: {
  rxData: number[];
  txData: number[];
}) {
  const w = 400,
    h = 60,
    pad = 3;
  const usable = h - pad * 2;
  const scaleLine = (data: number[], minPct = 0) => {
    if (data.length < 2) return [];
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = Math.max(max - min, 1);
    return data.map((v, i) => ({
      x: (i / Math.max(data.length - 1, 1)) * w,
      y: pad + usable * (1 - (minPct + ((v - min) / range) * (1 - minPct))),
    }));
  };
  const linePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = (pts: { x: number; y: number }[]) => {
    if (!pts.length) return "";
    return `${linePath(pts)} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  };
  const rxPts = scaleLine(rxData, 0.1);
  const txPts = scaleLine(txData, 0.25);
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="gRx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gTx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4adff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#c4adff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.33, 0.66].map((p) => (
        <line
          key={p}
          x1={0}
          y1={h * p}
          x2={w}
          y2={h * p}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
      ))}
      {rxPts.length > 1 && <path d={areaPath(rxPts)} fill="url(#gRx)" />}
      {txPts.length > 1 && <path d={areaPath(txPts)} fill="url(#gTx)" />}
      {rxPts.length > 1 && (
        <path
          d={linePath(rxPts)}
          fill="none"
          stroke="#4ade80"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {txPts.length > 1 && (
        <path
          d={linePath(txPts)}
          fill="none"
          stroke="#c4adff"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function StatusDot({ status }: { status: string }) {
  const on = ["online", "running", "up"].includes(status.toLowerCase());
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: on ? "#4ade80" : "#f87171",
        boxShadow: on ? "0 0 5px rgba(74,222,128,0.6)" : "none",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export function InfoRow({ k, v, s }: { k: string; v: string; s: S }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        fontSize: 12,
      }}
    >
      <span style={{ color: s.muted }}>{k}</span>
      <span style={{ color: s.text }}>{v}</span>
    </div>
  );
}
