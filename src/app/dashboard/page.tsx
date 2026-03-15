"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  S,
  TabId,
  Metrics,
  Container,
  PM2Process,
  FileEntry,
} from "@/components/dashboard/shared";
import DeployPanel from "@/components/dashboard/DeployPanel";
import SettingsTab from "@/components/dashboard/SettingsTab";
import CvEditor from "@/components/dashboard/CvEditor";
import HomeTab from "@/components/dashboard/tabs/HomeTab";
import MonitorTab from "@/components/dashboard/tabs/MonitorTab";
import DockerTab from "@/components/dashboard/tabs/DockerTab";
import Pm2Tab from "@/components/dashboard/tabs/Pm2Tab";
import FilesTab from "@/components/dashboard/tabs/FilesTab";

export default function DashboardPage() {
  const [tab, setTab] = useState<TabId>("home");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [rxHistory, setRxHistory] = useState<number[]>([]);
  const [txHistory, setTxHistory] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
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
  const logsRef = useRef<EventSource | null>(null);
  const [qaCols, setQaCols] = useState(() =>
    parseInt(process.env.NEXT_PUBLIC_QA_COLS ?? "3"),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Collapse sidebar on small screens by default
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-scroll PM2 logs to bottom on new lines
  useEffect(() => {
    const el = document.getElementById("pm2-log-body");
    if (el) el.scrollTop = el.scrollHeight;
  }, [pm2Logs?.lines.length]);

  const s: S = {
    bg: "#080810",
    surface: "#0f0f1e",
    surface2: "#131325",
    border: "rgba(255,255,255,0.08)",
    purple: "#c4adff",
    cyan: "#38bdf8",
    green: "#4ade80",
    red: "#f87171",
    amber: "#f59e0b",
    text: "#ddd8f8",
    muted: "rgba(255,255,255,0.32)",
    mono: "'Space Mono','Courier New',monospace",
  };

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = "/";
      return null;
    }
    return res;
  }, []);

  // SSE metrics with auto-reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
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
          fetch("/api/auth/token").then((r) => {
            if (!r.ok) {
              window.location.href = "/";
              return;
            }
            if (active) timer = setTimeout(connect, 3000);
          });
        };
      });
    };
    connect();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, []);

  const fetchDocker = useCallback(async () => {
    const res = await authFetch("/api/docker");
    if (!res) return;
    setContainers((await res.json()).containers ?? []);
  }, [authFetch]);

  const fetchPm2 = useCallback(async () => {
    const res = await authFetch("/api/pm2");
    if (!res) return;
    setPm2List((await res.json()).processes ?? []);
  }, [authFetch]);

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

  useEffect(() => {
    if (tab === "docker") fetchDocker();
    if (tab === "pm2" || tab === "home") fetchPm2();
    if (tab === "files") fetchFiles(filePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const t = setInterval(() => {
      if (tab === "docker") fetchDocker();
      if (tab === "pm2") fetchPm2();
    }, 10000);
    return () => clearInterval(t);
  }, [tab, fetchDocker, fetchPm2]);

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

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  };

  // Module feature flags from env — graceful disable if not set
  const modules = {
    metrics: process.env.NEXT_PUBLIC_ENABLE_METRICS !== "false",
    docker: process.env.NEXT_PUBLIC_ENABLE_DOCKER !== "false",
    pm2: process.env.NEXT_PUBLIC_ENABLE_PM2 !== "false",
    files: process.env.NEXT_PUBLIC_ENABLE_FILES !== "false",
    cv: process.env.NEXT_PUBLIC_ENABLE_CV === "true",
  };

  const tabs = [
    { id: "home", icon: "⬡", label: "Dashboard" },
    { id: "terminal", icon: ">_", label: "Terminal" },
    ...(modules.metrics
      ? [{ id: "monitor", icon: "◈", label: "Monitor" }]
      : []),
    ...(modules.docker ? [{ id: "docker", icon: "▣", label: "Docker" }] : []),
    ...(modules.pm2 ? [{ id: "pm2", icon: "⟳", label: "PM2" }] : []),
    ...(modules.files ? [{ id: "files", icon: "⊟", label: "Files" }] : []),
    ...(modules.cv ? [{ id: "cv", icon: "✎", label: "CV Editor" }] : []),
    { id: "settings", icon: "⚙", label: "Settings" },
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
      {/* Offline overlay */}
      {!connected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(8,8,16,0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 32 }}>⚡</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: s.red }}>
            Connection Lost
          </div>
          <div
            style={{
              fontSize: 12,
              color: s.muted,
              textAlign: "center",
              lineHeight: 1.8,
            }}
          >
            Cannot reach server.
            <br />
            Attempting to reconnect...
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: s.red,
                display: "inline-block",
              }}
            />
            <span
              style={{ fontSize: 11, color: s.muted, letterSpacing: "0.1em" }}
            >
              OFFLINE
            </span>
          </div>
        </div>
      )}

      {/* Sidebar — collapsible on mobile */}
      <aside
        style={{
          width: sidebarOpen ? 210 : 0,
          minWidth: sidebarOpen ? 210 : 0,
          borderRight: sidebarOpen ? `0.5px solid ${s.border}` : "none",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "#0b0b18",
          overflow: "hidden",
          transition: "width 0.2s ease, min-width 0.2s ease",
          position: "relative",
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: 210,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <div
            style={{
              padding: "20px 18px 16px",
              borderBottom: `0.5px solid ${s.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: "#151530",
                  border: "0.5px solid rgba(148,120,255,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <polygon
                    points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5"
                    stroke="#9478ff"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <circle cx="8" cy="8" r="2.2" fill="#9478ff" />
                </svg>
              </div>
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 500, color: "#ede8ff" }}
                >
                  VPS Manager
                </div>
                <div style={{ fontSize: 10, color: s.muted, marginTop: 1 }}>
                  {process.env.NEXT_PUBLIC_VPS_USER}@
                  {process.env.NEXT_PUBLIC_VPS_HOST}
                </div>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: "10px 0" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id as TabId);
                  // Close sidebar on mobile after selecting tab
                  if (window.matchMedia("(max-width: 768px)").matches)
                    setSidebarOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 18px",
                  background:
                    tab === t.id ? "rgba(128,96,208,0.12)" : "transparent",
                  border: "none",
                  borderLeft: `2px solid ${tab === t.id ? "#8060d0" : "transparent"}`,
                  color: tab === t.id ? "#c4adff" : s.muted,
                  fontFamily: s.mono,
                  fontSize: 13,
                  cursor: "pointer",
                  letterSpacing: "0.03em",
                  transition: "all 0.12s",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    width: 18,
                    textAlign: "center",
                    opacity: tab === t.id ? 1 : 0.6,
                  }}
                >
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </nav>

          <div
            style={{
              padding: "14px 18px",
              borderTop: `0.5px solid ${s.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 12,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: connected ? s.green : s.red,
                  boxShadow: connected
                    ? `0 0 5px rgba(74,222,128,0.7)`
                    : "none",
                  display: "inline-block",
                  animation: connected ? "none" : "pulse 1.5s infinite",
                }}
              />
              <span style={{ color: connected ? s.green : s.red }}>
                {connected ? "Connected" : "Offline"}
              </span>
            </div>
            <button
              onClick={logout}
              style={{
                width: "100%",
                padding: "8px",
                background: "rgba(248,113,113,0.07)",
                border: "0.5px solid rgba(248,113,113,0.2)",
                borderRadius: 8,
                color: s.red,
                fontFamily: s.mono,
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              LOGOUT
            </button>
          </div>
        </div>
        {/* end inner wrapper */}
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
        {/* Header */}
        <header
          style={{
            padding: "13px 22px",
            borderBottom: `0.5px solid ${s.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Hamburger toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            style={{
              width: 32,
              height: 32,
              background: "transparent",
              border: `0.5px solid ${s.border}`,
              borderRadius: 8,
              color: s.muted,
              fontFamily: s.mono,
              fontSize: 15,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {sidebarOpen ? "←" : "☰"}
          </button>
          <div
            style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#ede8ff" }}
          >
            <span style={{ color: s.muted, marginRight: 6, fontWeight: 400 }}>
              /
            </span>
            {tabs.find((t) => t.id === tab)?.label}
          </div>
          {metrics && (
            <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
              <span style={{ color: s.muted }}>
                CPU{" "}
                <span style={{ color: metrics.cpu > 80 ? s.red : s.purple }}>
                  {metrics.cpu}%
                </span>
              </span>
              <span style={{ color: s.muted }}>
                RAM{" "}
                <span style={{ color: metrics.ram.pct > 80 ? s.red : s.cyan }}>
                  {metrics.ram.pct}%
                </span>
              </span>
              <span style={{ color: s.muted }}>
                DISK{" "}
                <span
                  style={{ color: metrics.disk.pct > 80 ? s.red : s.green }}
                >
                  {metrics.disk.pct}%
                </span>
              </span>
            </div>
          )}
          <DeployPanel authFetch={authFetch} s={s} />
        </header>

        <div
          style={{
            flex: 1,
            overflow: tab === "terminal" ? "hidden" : "auto",
            padding: tab === "terminal" ? 0 : 20,
            position: "relative",
          }}
        >
          {/* ── HOME ── */}
          {tab === "home" && (
            <HomeTab
              metrics={metrics}
              pm2List={pm2List}
              modules={modules}
              qaCols={qaCols}
              setQaCols={setQaCols}
              setTab={setTab}
              authFetch={authFetch}
              s={s}
            />
          )}
          {/* ── TERMINAL ── */}
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

          {/* ── MONITOR ── */}
          {tab === "monitor" && (
            <MonitorTab
              metrics={metrics}
              cpuHistory={cpuHistory}
              ramHistory={ramHistory}
              rxHistory={rxHistory}
              txHistory={txHistory}
              s={s}
            />
          )}
          {/* ── DOCKER ── */}
          {tab === "docker" && (
            <DockerTab
              containers={containers}
              authFetch={authFetch}
              fetchContainers={fetchDocker}
              s={s}
            />
          )}
          {/* ── PM2 ── */}
          {tab === "pm2" && (
            <Pm2Tab
              pm2List={pm2List}
              fetchPm2={fetchPm2}
              authFetch={authFetch}
              s={s}
            />
          )}
          {/* ── FILES ── */}
          {tab === "files" && (
            <FilesTab
              files={files}
              filePath={filePath}
              fileContent={fileContent}
              loading={loading}
              setFilePath={setFilePath}
              setFileContent={setFileContent}
              fetchFiles={fetchFiles}
              authFetch={authFetch}
              s={s}
            />
          )}
          {/* ── CV EDITOR ── */}
          {tab === "cv" && modules.cv && (
            <CvEditor authFetch={authFetch} s={s} />
          )}

          {/* ── SETTINGS ── */}
          {tab === "settings" && <SettingsTab authFetch={authFetch} s={s} />}
        </div>
      </main>
    </div>
  );
}
