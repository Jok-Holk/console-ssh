"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Metrics {
  cpu: number;
  ram: {
    total: number;
    used: number;
    free: number;
    buffers: number;
    cached: number;
    pct: number;
  };
  disk: { total: number; used: number; free: number; pct: number };
  uptime: string;
  load: { "1m": string; "5m": string; "15m": string };
  network: { rxSec: number; txSec: number; rxTotal: number; txTotal: number };
}
interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}
interface PM2Process {
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
interface FileEntry {
  name: string;
  type: "dir" | "file";
  size: number;
  modified: string;
  viewable: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
function fmtKB(kb: number): string {
  return fmt(kb * 1024);
}
function fmtUptime(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Bar({ pct, color = "purple" }: { pct: number; color?: string }) {
  const colors: Record<string, string> = {
    purple: "#a855f7",
    cyan: "#22d3ee",
    green: "#4ade80",
    amber: "#f59e0b",
    red: "#f87171",
  };
  const c =
    pct > 85
      ? colors.red
      : pct > 60
        ? colors.amber
        : (colors[color] ?? colors.purple);
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 4,
        height: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          background: c,
          borderRadius: 4,
          transition: "width 0.8s ease",
          boxShadow: `0 0 8px ${c}80`,
        }}
      />
    </div>
  );
}

function Sparkline({
  data,
  color = "#a855f7",
}: {
  data: number[];
  color?: string;
}) {
  if (data.length < 2) return null;
  const w = 120,
    h = 36;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Dual-scale chart: each line scales independently but TX is clamped to min 25% height
// This makes both lines clearly visible even when one value is much larger
function NetworkChart({
  rxData,
  txData,
}: {
  rxData: number[];
  txData: number[];
}) {
  const w = 400,
    h = 60,
    pad = 4;
  const usable = h - pad * 2;

  const scaleLine = (data: number[], minPct = 0) => {
    if (data.length < 2) return [];
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = Math.max(max - min, 1);
    return data.map((v, i) => {
      const norm = (v - min) / range; // 0–1 within its own range
      // Map to [minPct .. 1] of usable height, then invert (SVG y is top-down)
      const y = pad + usable * (1 - (minPct + norm * (1 - minPct)));
      return { x: (i / Math.max(data.length - 1, 1)) * w, y };
    });
  };

  const rxPts = scaleLine(rxData, 0.1);
  const txPts = scaleLine(txData, 0.25); // TX always uses at least 25% of height

  const linePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const areaPath = (pts: { x: number; y: number }[]) => {
    if (!pts.length) return "";
    const l = pts[pts.length - 1];
    const f = pts[0];
    return `${linePath(pts)} L${l.x},${h} L${f.x},${h} Z`;
  };

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
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gTx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.33, 0.66].map((p) => (
        <line
          key={p}
          x1={0}
          y1={h * p}
          x2={w}
          y2={h * p}
          stroke="rgba(255,255,255,0.05)"
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
          stroke="#a855f7"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  const isOnline = ["online", "running", "up"].includes(status.toLowerCase());
  const color = isOnline ? "#4ade80" : "#f87171";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}`,
        marginRight: 6,
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tab, setTab] = useState<
    "home" | "terminal" | "monitor" | "docker" | "pm2" | "files"
  >("home");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [rxHistory, setRxHistory] = useState<number[]>([]);
  const [txHistory, setTxHistory] = useState<number[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [pm2List, setPm2List] = useState<PM2Process[]>([]);
  const [pm2Logs, setPm2Logs] = useState<{
    name: string;
    lines: string[];
  } | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filePath, setFilePath] = useState("/root");
  const [fileContent, setFileContent] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  const logsEventRef = useRef<EventSource | null>(null);

  // Redirect to login on 401
  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = "/";
      return null;
    }
    return res;
  }, []);

  // Metrics SSE stream with auto-reconnect — redirect to login on auth failure
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      fetch("/api/auth/token").then((r) => {
        if (!r.ok) {
          window.location.href = "/";
          return;
        }

        es = new EventSource("/api/metrics");

        es.onopen = () => setConnected(true);

        es.onmessage = (e) => {
          const data: Metrics = JSON.parse(e.data);
          if (data && !("error" in data)) {
            setMetrics(data);
            setCpuHistory((h) => [...h.slice(-29), data.cpu]);
            setRamHistory((h) => [...h.slice(-29), data.ram.pct]);
            setRxHistory((h) => [...h.slice(-29), data.network.rxSec]);
            setTxHistory((h) => [...h.slice(-29), data.network.txSec]);
          }
        };

        es.onerror = () => {
          setConnected(false);
          es?.close();
          // Check if auth expired, else retry in 3s
          fetch("/api/auth/token").then((r) => {
            if (!r.ok) {
              window.location.href = "/";
              return;
            }
            if (active) reconnectTimer = setTimeout(connect, 3000);
          });
        };
      });
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  const fetchDocker = useCallback(async () => {
    const res = await authFetch("/api/docker");
    if (!res) return;
    const data = await res.json();
    setContainers(data.containers ?? []);
  }, [authFetch]);

  const dockerAction = async (id: string, action: string) => {
    await authFetch("/api/docker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    fetchDocker();
  };

  const fetchPm2 = useCallback(async () => {
    const res = await authFetch("/api/pm2");
    if (!res) return;
    const data = await res.json();
    setPm2List(data.processes ?? []);
  }, [authFetch]);

  const pm2Action = async (id: number, action: string) => {
    await authFetch("/api/pm2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setTimeout(fetchPm2, 1000);
  };

  const fetchPm2Logs = (name: string) => {
    logsEventRef.current?.close();
    setPm2Logs({ name, lines: [] });
    const es = new EventSource(`/api/pm2/logs?name=${name}&lines=100`);
    logsEventRef.current = es;
    es.onmessage = (e) => {
      const { line } = JSON.parse(e.data);
      setPm2Logs((prev) =>
        prev ? { ...prev, lines: [...prev.lines.slice(-199), line] } : null,
      );
    };
    es.onerror = () => es.close();
  };

  const fetchFiles = useCallback(
    async (path: string) => {
      setLoading(true);
      setFileContent(null);
      const res = await authFetch(
        `/api/files?path=${encodeURIComponent(path)}`,
      );
      if (!res) return;
      const data = await res.json();
      setFiles(data.files ?? []);
      setFilePath(data.path ?? path);
      setLoading(false);
    },
    [authFetch],
  );

  const viewFile = async (path: string, name: string) => {
    const res = await authFetch(
      `/api/files?path=${encodeURIComponent(path)}&view=1`,
    );
    if (!res) return;
    setFileContent({ name, content: await res.text() });
  };

  const downloadFile = (path: string) =>
    window.open(`/api/files?path=${encodeURIComponent(path)}&download=1`);
  const downloadZip = (path: string) =>
    window.open(`/api/files?path=${encodeURIComponent(path)}&zip=1`);

  // Fetch data when switching tabs
  useEffect(() => {
    if (tab === "docker") fetchDocker();
    if (tab === "pm2") fetchPm2();
    if (tab === "files") fetchFiles(filePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Poll docker/pm2 every 10s when on those tabs
  useEffect(() => {
    const t = setInterval(() => {
      if (tab === "docker") fetchDocker();
      if (tab === "pm2") fetchPm2();
    }, 10000);
    return () => clearInterval(t);
  }, [tab, fetchDocker, fetchPm2]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const s = {
    bg: "#06060f",
    surface: "rgba(255,255,255,0.025)",
    border: "rgba(168,85,247,0.15)",
    purple: "#a855f7",
    cyan: "#22d3ee",
    green: "#4ade80",
    red: "#f87171",
    amber: "#f59e0b",
    text: "#e0e0ff",
    muted: "rgba(255,255,255,0.38)",
    mono: "'Space Mono', monospace",
  } as const;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `1px solid ${s.border}`,
    borderRadius: 12,
    padding: "14px 16px",
    ...extra,
  });

  const tabs = [
    { id: "home", icon: "⬡", label: "Dashboard" },
    { id: "terminal", icon: ">_", label: "Terminal" },
    { id: "monitor", icon: "◈", label: "Monitor" },
    { id: "docker", icon: "▣", label: "Docker" },
    { id: "pm2", icon: "⟳", label: "PM2" },
    { id: "files", icon: "⊟", label: "Files" },
  ] as const;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: s.bg,
        color: s.text,
        fontFamily: s.mono,
        overflow: "hidden",
      }}
    >
      {/* Offline overlay — shown when SSE disconnects */}
      {!connected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(6,6,15,0.85)",
            backdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 36 }}>⚡</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: s.red }}>
            Connection Lost
          </div>
          <div
            style={{
              fontSize: 11,
              color: s.muted,
              textAlign: "center",
              lineHeight: 1.8,
            }}
          >
            Cannot reach server metrics stream.
            <br />
            Attempting to reconnect...
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: s.red,
                display: "inline-block",
                animation: "pulse 1.5s infinite",
              }}
            />
            <span
              style={{ fontSize: 10, color: s.muted, letterSpacing: "0.1em" }}
            >
              OFFLINE
            </span>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: 200,
          borderRight: `1px solid ${s.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "20px 16px 14px",
            borderBottom: `1px solid ${s.border}`,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: s.purple,
              textShadow: `0 0 14px ${s.purple}99`,
            }}
          >
            VPS Control
          </div>
          <div
            style={{
              fontSize: 9,
              color: s.muted,
              letterSpacing: "0.12em",
              marginTop: 2,
            }}
          >
            {process.env.NEXT_PUBLIC_VPS_USER}@
            {process.env.NEXT_PUBLIC_VPS_HOST}
          </div>
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                background:
                  tab === t.id ? "rgba(168,85,247,0.12)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${tab === t.id ? s.purple : "transparent"}`,
                color: tab === t.id ? s.purple : s.muted,
                fontFamily: s.mono,
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: "0.06em",
                transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div
          style={{ padding: "12px 16px", borderTop: `1px solid ${s.border}` }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: connected ? s.green : s.red,
                boxShadow: `0 0 6px ${connected ? s.green : s.red}`,
                display: "inline-block",
                animation: connected ? "none" : "pulse 1.5s infinite",
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: connected ? s.green : s.red,
                letterSpacing: "0.08em",
              }}
            >
              {connected ? "Connected" : "Offline"}
            </span>
          </div>
          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "7px 0",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 6,
              color: s.red,
              fontFamily: s.mono,
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: "0.1em",
            }}
          >
            LOGOUT
          </button>
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <header
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${s.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <span style={{ fontSize: 13, color: s.muted, marginRight: 8 }}>
              /
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {tabs.find((t) => t.id === tab)?.label}
            </span>
          </div>
          {metrics && (
            <div
              style={{ display: "flex", gap: 16, fontSize: 10, color: s.muted }}
            >
              <span>
                CPU{" "}
                <span style={{ color: metrics.cpu > 80 ? s.red : s.purple }}>
                  {metrics.cpu}%
                </span>
              </span>
              <span>
                RAM{" "}
                <span style={{ color: metrics.ram.pct > 80 ? s.red : s.cyan }}>
                  {metrics.ram.pct}%
                </span>
              </span>
              <span>
                DISK{" "}
                <span
                  style={{ color: metrics.disk.pct > 80 ? s.red : s.green }}
                >
                  {metrics.disk.pct}%
                </span>
              </span>
            </div>
          )}
        </header>

        <div
          style={{
            flex: 1,
            overflow: tab === "terminal" ? "hidden" : "auto",
            padding: tab === "terminal" ? 0 : 16,
            position: "relative",
          }}
        >
          {/* HOME */}
          {tab === "home" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              {[
                {
                  label: "CPU USAGE",
                  value: metrics?.cpu ?? 0,
                  color: s.purple,
                },
                {
                  label: "RAM USAGE",
                  value: metrics?.ram.pct ?? 0,
                  color: s.cyan,
                },
                {
                  label: "DISK USAGE",
                  value: metrics?.disk.pct ?? 0,
                  color: s.green,
                },
              ].map((item) => (
                <div key={item.label} style={card()}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: s.muted,
                        letterSpacing: "0.14em",
                      }}
                    >
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: item.color,
                      }}
                    >
                      {item.value}%
                    </span>
                  </div>
                  <Bar pct={item.value} />
                </div>
              ))}
              <div style={{ ...card(), gridColumn: "1 / 3" }}>
                <div
                  style={{
                    fontSize: 9,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 12,
                  }}
                >
                  SYSTEM
                </div>
                {[
                  ["Uptime", metrics?.uptime ?? "—"],
                  [
                    "Load Avg",
                    metrics
                      ? `${metrics.load["1m"]} ${metrics.load["5m"]} ${metrics.load["15m"]}`
                      : "—",
                  ],
                  ["IP", process.env.NEXT_PUBLIC_VPS_HOST ?? "—"],
                  [
                    "Network ↓",
                    metrics ? fmt(metrics.network.rxSec) + "/s" : "—",
                  ],
                  [
                    "Network ↑",
                    metrics ? fmt(metrics.network.txSec) + "/s" : "—",
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: s.muted }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
              <div style={card()}>
                <div
                  style={{
                    fontSize: 9,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 12,
                  }}
                >
                  CONTAINERS
                </div>
                {containers.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: s.muted,
                      textAlign: "center",
                      padding: "16px 0",
                    }}
                  >
                    No containers
                  </div>
                ) : (
                  containers.slice(0, 4).map((c) => (
                    <div
                      key={c.Id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 0",
                        fontSize: 11,
                      }}
                    >
                      <StatusDot status={c.State} />
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.Names[0]?.replace("/", "")}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {(
                [
                  {
                    id: "terminal",
                    icon: ">_",
                    label: "Terminal",
                    sub: "SSH Console",
                  },
                  {
                    id: "monitor",
                    icon: "◈",
                    label: "Monitor",
                    sub: "Realtime Metrics",
                  },
                  {
                    id: "docker",
                    icon: "▣",
                    label: "Docker",
                    sub: "Containers",
                  },
                  {
                    id: "pm2",
                    icon: "⟳",
                    label: "PM2",
                    sub: "Process Manager",
                  },
                  {
                    id: "files",
                    icon: "⊟",
                    label: "Files",
                    sub: "SFTP Explorer",
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  style={{
                    ...card({ cursor: "pointer", transition: "all 0.15s" }),
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = s.border)
                  }
                >
                  <span style={{ fontSize: 22, color: s.purple }}>
                    {item.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 10, color: s.muted }}>
                      {item.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TERMINAL */}
          {tab === "terminal" && (
            <div style={{ position: "absolute", inset: 0 }}>
              <iframe
                src="/console"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  display: "block",
                }}
                title="Terminal"
              />
            </div>
          )}

          {/* MONITOR */}
          {tab === "monitor" && metrics && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {/* CPU */}
              <div style={card()}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: s.muted,
                      letterSpacing: "0.14em",
                    }}
                  >
                    CPU
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Sparkline data={cpuHistory} color={s.purple} />
                    <span
                      style={{ fontSize: 22, fontWeight: 700, color: s.purple }}
                    >
                      {metrics.cpu}%
                    </span>
                  </div>
                </div>
                <Bar pct={metrics.cpu} />
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 12,
                    fontSize: 10,
                    color: s.muted,
                  }}
                >
                  <span>1m: {metrics.load["1m"]}</span>
                  <span>5m: {metrics.load["5m"]}</span>
                  <span>15m: {metrics.load["15m"]}</span>
                </div>
              </div>

              {/* RAM */}
              <div style={card()}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: s.muted,
                      letterSpacing: "0.14em",
                    }}
                  >
                    MEMORY
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Sparkline data={ramHistory} color={s.cyan} />
                    <span
                      style={{ fontSize: 22, fontWeight: 700, color: s.cyan }}
                    >
                      {metrics.ram.pct}%
                    </span>
                  </div>
                </div>
                <Bar pct={metrics.ram.pct} color="cyan" />
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                    fontSize: 10,
                  }}
                >
                  {[
                    ["Used", fmtKB(metrics.ram.used)],
                    ["Free", fmtKB(metrics.ram.free)],
                    ["Buffers", fmtKB(metrics.ram.buffers)],
                    ["Cached", fmtKB(metrics.ram.cached)],
                    ["Total", fmtKB(metrics.ram.total)],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: s.muted }}>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DISK */}
              <div style={card()}>
                <div
                  style={{
                    fontSize: 9,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 10,
                  }}
                >
                  DISK
                </div>
                <Bar pct={metrics.disk.pct} color="green" />
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 16,
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: s.muted }}>Used</span>
                  <span>
                    {metrics.disk.used}MB / {metrics.disk.total}MB
                  </span>
                  <span style={{ color: s.muted, marginLeft: "auto" }}>
                    Free: {metrics.disk.free}MB
                  </span>
                </div>
              </div>

              {/* Network stats */}
              <div style={card()}>
                <div
                  style={{
                    fontSize: 9,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 10,
                  }}
                >
                  NETWORK
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      padding: "10px",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: 8,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 9, color: s.muted, marginBottom: 4 }}
                    >
                      ↓ DOWNLOAD
                    </div>
                    <div
                      style={{ fontSize: 18, fontWeight: 700, color: s.green }}
                    >
                      {fmt(metrics.network.rxSec)}/s
                    </div>
                    <div style={{ fontSize: 9, color: s.muted, marginTop: 2 }}>
                      total: {fmt(metrics.network.rxTotal)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "10px",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: 8,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 9, color: s.muted, marginBottom: 4 }}
                    >
                      ↑ UPLOAD
                    </div>
                    <div
                      style={{ fontSize: 18, fontWeight: 700, color: s.purple }}
                    >
                      {fmt(metrics.network.txSec)}/s
                    </div>
                    <div style={{ fontSize: 9, color: s.muted, marginTop: 2 }}>
                      total: {fmt(metrics.network.txTotal)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Network realtime chart — full width */}
              <div style={{ ...card(), gridColumn: "1 / 3" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: s.muted,
                      letterSpacing: "0.14em",
                    }}
                  >
                    NETWORK BANDWIDTH (realtime)
                  </span>
                  <div style={{ display: "flex", gap: 14, fontSize: 10 }}>
                    <span style={{ color: s.green }}>
                      ● ↓ {fmt(metrics.network.rxSec)}/s
                    </span>
                    <span style={{ color: s.purple }}>
                      ● ↑ {fmt(metrics.network.txSec)}/s
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: 8,
                    padding: "6px 4px",
                    height: 72,
                    overflow: "hidden",
                  }}
                >
                  <NetworkChart rxData={rxHistory} txData={txHistory} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontSize: 9,
                    color: s.muted,
                  }}
                >
                  <span>90s ago</span>
                  <span>now</span>
                </div>
              </div>
            </div>
          )}

          {/* DOCKER */}
          {tab === "docker" && (
            <div style={card()}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: s.muted,
                    letterSpacing: "0.14em",
                  }}
                >
                  CONTAINERS ({containers.length})
                </span>
                <button
                  onClick={fetchDocker}
                  style={{
                    padding: "4px 12px",
                    background: "transparent",
                    border: `1px solid ${s.border}`,
                    borderRadius: 5,
                    color: s.muted,
                    fontFamily: s.mono,
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  Refresh
                </button>
              </div>
              {containers.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    color: s.muted,
                    fontSize: 12,
                  }}
                >
                  No containers found
                </div>
              ) : (
                containers.map((c) => (
                  <div
                    key={c.Id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      fontSize: 11,
                    }}
                  >
                    <StatusDot status={c.State} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {c.Names[0]?.replace("/", "")}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: s.muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.Image} · {c.Status}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["start", "stop", "restart"].map((action) => (
                        <button
                          key={action}
                          onClick={() => dockerAction(c.Id, action)}
                          style={{
                            padding: "3px 8px",
                            background: "transparent",
                            border: `1px solid ${s.border}`,
                            borderRadius: 4,
                            color:
                              action === "stop"
                                ? s.red
                                : action === "restart"
                                  ? s.amber
                                  : s.green,
                            fontFamily: s.mono,
                            fontSize: 9,
                            cursor: "pointer",
                          }}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* PM2 */}
          {tab === "pm2" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: pm2Logs ? "1fr 1fr" : "1fr",
                gap: 12,
              }}
            >
              <div style={card()}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: s.muted,
                      letterSpacing: "0.14em",
                    }}
                  >
                    PROCESSES ({pm2List.length})
                  </span>
                  <button
                    onClick={fetchPm2}
                    style={{
                      padding: "4px 12px",
                      background: "transparent",
                      border: `1px solid ${s.border}`,
                      borderRadius: 5,
                      color: s.muted,
                      fontFamily: s.mono,
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    Refresh
                  </button>
                </div>
                {pm2List.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 0",
                      color: s.muted,
                      fontSize: 12,
                    }}
                  >
                    No processes
                  </div>
                ) : (
                  pm2List.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: "10px 0",
                        borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <StatusDot status={p.status} />
                        <span
                          style={{ fontWeight: 700, fontSize: 12, flex: 1 }}
                        >
                          {p.name}
                        </span>
                        <span style={{ fontSize: 9, color: s.muted }}>
                          #{p.id} · {p.mode}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          fontSize: 10,
                          color: s.muted,
                          marginBottom: 8,
                          paddingLeft: 14,
                        }}
                      >
                        <span>
                          CPU: <span style={{ color: s.text }}>{p.cpu}%</span>
                        </span>
                        <span>
                          MEM:{" "}
                          <span style={{ color: s.text }}>{fmt(p.memory)}</span>
                        </span>
                        <span>
                          ↺:{" "}
                          <span
                            style={{ color: p.restarts > 5 ? s.red : s.text }}
                          >
                            {p.restarts}
                          </span>
                        </span>
                        <span>
                          UP:{" "}
                          <span style={{ color: s.text }}>
                            {fmtUptime(p.uptime)}
                          </span>
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, paddingLeft: 14 }}>
                        {["restart", "stop", "start", "delete"].map(
                          (action) => (
                            <button
                              key={action}
                              onClick={() => pm2Action(p.id, action)}
                              style={{
                                padding: "3px 8px",
                                background: "transparent",
                                border: `1px solid ${s.border}`,
                                borderRadius: 4,
                                color:
                                  action === "delete"
                                    ? s.red
                                    : action === "stop"
                                      ? s.amber
                                      : action === "restart"
                                        ? s.purple
                                        : s.green,
                                fontFamily: s.mono,
                                fontSize: 9,
                                cursor: "pointer",
                              }}
                            >
                              {action}
                            </button>
                          ),
                        )}
                        <button
                          onClick={() => fetchPm2Logs(p.name)}
                          style={{
                            padding: "3px 8px",
                            background: "rgba(168,85,247,0.1)",
                            border: `1px solid rgba(168,85,247,0.25)`,
                            borderRadius: 4,
                            color: s.purple,
                            fontFamily: s.mono,
                            fontSize: 9,
                            cursor: "pointer",
                          }}
                        >
                          logs
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {pm2Logs && (
                <div
                  style={{
                    ...card(),
                    display: "flex",
                    flexDirection: "column",
                    height: "calc(100vh - 120px)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: s.muted,
                        letterSpacing: "0.14em",
                      }}
                    >
                      LOGS — {pm2Logs.name}
                    </span>
                    <button
                      onClick={() => {
                        logsEventRef.current?.close();
                        setPm2Logs(null);
                      }}
                      style={{
                        padding: "3px 8px",
                        background: "transparent",
                        border: `1px solid ${s.border}`,
                        borderRadius: 4,
                        color: s.muted,
                        fontFamily: s.mono,
                        fontSize: 9,
                        cursor: "pointer",
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: "auto",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 6,
                      padding: 10,
                    }}
                  >
                    {pm2Logs.lines.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 10,
                          lineHeight: 1.7,
                          color:
                            line.includes("error") || line.includes("ERR")
                              ? s.red
                              : s.text,
                          fontFamily: s.mono,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FILES */}
          {tab === "files" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: fileContent ? "1fr 1.5fr" : "1fr",
                gap: 12,
                height: "calc(100vh - 120px)",
              }}
            >
              <div
                style={{
                  ...card(),
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {filePath
                    .split("/")
                    .filter(Boolean)
                    .map((seg, i, arr) => {
                      const p = "/" + arr.slice(0, i + 1).join("/");
                      return (
                        <span
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {i > 0 && <span style={{ color: s.muted }}>/</span>}
                          <button
                            onClick={() => fetchFiles(p)}
                            style={{
                              background: "none",
                              border: "none",
                              color: i === arr.length - 1 ? s.text : s.purple,
                              fontFamily: s.mono,
                              fontSize: 11,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {seg}
                          </button>
                        </span>
                      );
                    })}
                  <button
                    onClick={() => downloadZip(filePath)}
                    style={{
                      marginLeft: "auto",
                      padding: "2px 8px",
                      background: "transparent",
                      border: `1px solid ${s.border}`,
                      borderRadius: 4,
                      color: s.muted,
                      fontFamily: s.mono,
                      fontSize: 9,
                      cursor: "pointer",
                    }}
                  >
                    ↓ zip folder
                  </button>
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  {loading ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "32px 0",
                        color: s.muted,
                      }}
                    >
                      Loading...
                    </div>
                  ) : (
                    files.map((f) => (
                      <div
                        key={f.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 4px",
                          borderBottom: `1px solid rgba(255,255,255,0.04)`,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(168,85,247,0.05)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <span
                          style={{
                            color: f.type === "dir" ? s.amber : s.muted,
                            width: 14,
                            flexShrink: 0,
                          }}
                        >
                          {f.type === "dir" ? "▸" : "·"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            color: f.type === "dir" ? s.text : s.muted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() =>
                            f.type === "dir"
                              ? fetchFiles(`${filePath}/${f.name}`)
                              : f.viewable
                                ? viewFile(`${filePath}/${f.name}`, f.name)
                                : null
                          }
                        >
                          {f.name}
                        </span>
                        <span
                          style={{ fontSize: 9, color: s.muted, flexShrink: 0 }}
                        >
                          {f.modified}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            color: s.muted,
                            width: 50,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {f.type === "file" ? fmt(f.size) : ""}
                        </span>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {f.viewable && (
                            <button
                              onClick={() =>
                                viewFile(`${filePath}/${f.name}`, f.name)
                              }
                              style={{
                                padding: "2px 6px",
                                background: "transparent",
                                border: `1px solid ${s.border}`,
                                borderRadius: 3,
                                color: s.cyan,
                                fontFamily: s.mono,
                                fontSize: 8,
                                cursor: "pointer",
                              }}
                            >
                              view
                            </button>
                          )}
                          {f.type === "file" && (
                            <button
                              onClick={() =>
                                downloadFile(`${filePath}/${f.name}`)
                              }
                              style={{
                                padding: "2px 6px",
                                background: "transparent",
                                border: `1px solid ${s.border}`,
                                borderRadius: 3,
                                color: s.purple,
                                fontFamily: s.mono,
                                fontSize: 8,
                                cursor: "pointer",
                              }}
                            >
                              ↓
                            </button>
                          )}
                          {f.type === "dir" && (
                            <button
                              onClick={() =>
                                downloadZip(`${filePath}/${f.name}`)
                              }
                              style={{
                                padding: "2px 6px",
                                background: "transparent",
                                border: `1px solid ${s.border}`,
                                borderRadius: 3,
                                color: s.purple,
                                fontFamily: s.mono,
                                fontSize: 8,
                                cursor: "pointer",
                              }}
                            >
                              zip
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {fileContent && (
                <div
                  style={{
                    ...card(),
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 11, color: s.cyan }}>
                      {fileContent.name}
                    </span>
                    <button
                      onClick={() => setFileContent(null)}
                      style={{
                        padding: "3px 8px",
                        background: "transparent",
                        border: `1px solid ${s.border}`,
                        borderRadius: 4,
                        color: s.muted,
                        fontFamily: s.mono,
                        fontSize: 9,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <pre
                    style={{
                      flex: 1,
                      overflow: "auto",
                      margin: 0,
                      fontSize: 11,
                      lineHeight: 1.7,
                      color: s.text,
                      fontFamily: s.mono,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: 6,
                      padding: 12,
                    }}
                  >
                    {fileContent.content}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
