"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Metrics = {
  cpu: number;
  ram: number;
  disk: number;
  uptime: string;
  load: string;
};

type Container = {
  id: string;
  name: string;
  image: string;
  status: string; // full status string e.g. "Up 2 hours"
  state: string; // "running" | "exited" | "paused" etc.
};

type FileEntry = {
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "terminal", label: "Terminal", icon: "❯_" },
  { id: "monitor", label: "Monitor", icon: "◈" },
  { id: "docker", label: "Docker", icon: "⊡" },
  { id: "files", label: "Files", icon: "◫" },
];

const DEFAULT_METRICS: Metrics = {
  cpu: 0,
  ram: 0,
  disk: 0,
  uptime: "—",
  load: "—",
};

// ─── Utility components ───────────────────────────────────────────────────────

function GlowBar({
  value,
  color = "purple",
}: {
  value: number;
  color?: string;
}) {
  const colors: Record<string, { bar: string; glow: string; bg: string }> = {
    purple: {
      bar: "#a855f7",
      glow: "rgba(168,85,247,0.5)",
      bg: "rgba(168,85,247,0.1)",
    },
    cyan: {
      bar: "#22d3ee",
      glow: "rgba(34,211,238,0.5)",
      bg: "rgba(34,211,238,0.1)",
    },
    green: {
      bar: "#4ade80",
      glow: "rgba(74,222,128,0.5)",
      bg: "rgba(74,222,128,0.1)",
    },
    red: {
      bar: "#f87171",
      glow: "rgba(248,113,113,0.5)",
      bg: "rgba(248,113,113,0.1)",
    },
  };
  const c = colors[color] ?? colors.purple;
  return (
    <div
      style={{
        background: c.bg,
        borderRadius: 4,
        height: 6,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          width: `${Math.min(value, 100)}%`,
          height: "100%",
          borderRadius: 4,
          background: c.bar,
          boxShadow: `0 0 8px ${c.glow}`,
          transition: "width 0.8s ease",
        }}
      />
    </div>
  );
}

function StatRing({
  value,
  label,
  color,
  glow,
}: {
  value: number;
  label: string;
  color: string;
  glow: string;
}) {
  const r = 36,
    circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.min(value, 100) / 100);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ position: "relative", width: 90, height: 90 }}>
        <svg width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx="45"
            cy="45"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <circle
            cx="45"
            cy="45"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circ}
            strokeDashoffset={dash}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${glow})`,
              transition: "stroke-dashoffset 0.8s ease",
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color,
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {Math.round(value)}%
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: "'Space Mono', monospace",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Sparkline({ history, color }: { history: number[]; color: string }) {
  if (history.length < 2) return null;
  const w = 200,
    h = 40;
  const max = Math.max(...history, 1);
  const pts = history.map((v, i) => ({
    x: (i / (history.length - 1)) * w,
    y: h - (v / max) * (h - 4) - 2,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  const gradId = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}

function TerminalView() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <iframe
        src="/console"
        style={{
          flex: 1,
          border: "none",
          background: "#0f0f23",
          borderRadius: 8,
          margin: 16,
        }}
        title="SSH Terminal"
      />
    </div>
  );
}

// ─── Monitor View ──────────────────────────────────────────────────────────────

function MonitorView({
  metrics,
  history,
}: {
  metrics: Metrics;
  history: { cpu: number[]; ram: number[]; disk: number[] };
}) {
  const rings = [
    {
      label: "CPU",
      value: metrics.cpu,
      color: "#a855f7",
      glow: "rgba(168,85,247,0.6)",
      histKey: "cpu" as const,
    },
    {
      label: "RAM",
      value: metrics.ram,
      color: "#22d3ee",
      glow: "rgba(34,211,238,0.6)",
      histKey: "ram" as const,
    },
    {
      label: "Disk",
      value: metrics.disk,
      color: "#4ade80",
      glow: "rgba(74,222,128,0.6)",
      histKey: "disk" as const,
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {rings.map((s) => (
          <div
            key={s.label}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <StatRing
              value={s.value}
              label={s.label}
              color={s.color}
              glow={s.glow}
            />
            <Sparkline history={history[s.histKey]} color={s.color} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { label: "Uptime", value: metrics.uptime, icon: "⏱" },
          { label: "Load Average", value: metrics.load, icon: "⚡" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(168,85,247,0.15)",
              borderRadius: 10,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20, opacity: 0.6 }}>{item.icon}</span>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#e0e0ff",
                  fontFamily: "'Space Mono', monospace",
                  marginTop: 2,
                }}
              >
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Docker View ───────────────────────────────────────────────────────────────

function DockerView() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch("/api/docker");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setContainers(data.containers ?? []);
      setError(null);
    } catch {
      setError("Cannot connect to Docker API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContainers();
    // Poll every 10 seconds to update the status.
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  const doAction = async (id: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${id}-${action}`);
    try {
      await fetch("/api/docker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      // Wait 1 second then refresh — Docker needs some time to change state.
      await new Promise((r) => setTimeout(r, 1000));
      await fetchContainers();
    } catch {
      setError("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading)
    return (
      <div
        style={{
          padding: 24,
          fontFamily: "'Space Mono', monospace",
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
        }}
      >
        Loading containers...
      </div>
    );

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            letterSpacing: "0.1em",
          }}
        >
          {containers.filter((c) => c.state === "running").length}/
          {containers.length} RUNNING
        </span>
        <button
          onClick={fetchContainers}
          style={{
            padding: "6px 14px",
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 6,
            color: "#a855f7",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 8,
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {containers.map((c) => {
          const isRunning = c.state === "running";
          return (
            <div
              key={c.id}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${isRunning ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "border-color 0.3s",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isRunning ? "#4ade80" : "#6b7280",
                  boxShadow: isRunning
                    ? "0 0 8px rgba(74,222,128,0.8)"
                    : "none",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    color: "#e0e0ff",
                    fontSize: 13,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    color: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.image}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.35)",
                  flexShrink: 0,
                }}
              >
                {c.status}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  disabled={!!actionLoading}
                  onClick={() => doAction(c.id, isRunning ? "stop" : "start")}
                  style={{
                    padding: "5px 12px",
                    border: "none",
                    borderRadius: 5,
                    cursor: actionLoading ? "wait" : "pointer",
                    fontSize: 11,
                    fontFamily: "'Space Mono', monospace",
                    opacity:
                      actionLoading ===
                      `${c.id}-${isRunning ? "stop" : "start"}`
                        ? 0.5
                        : 1,
                    background: isRunning
                      ? "rgba(248,113,113,0.15)"
                      : "rgba(74,222,128,0.15)",
                    color: isRunning ? "#f87171" : "#4ade80",
                  }}
                >
                  {isRunning ? "Stop" : "Start"}
                </button>
                <button
                  disabled={!isRunning || !!actionLoading}
                  onClick={() => doAction(c.id, "restart")}
                  style={{
                    padding: "5px 12px",
                    background: "rgba(168,85,247,0.1)",
                    border: "none",
                    borderRadius: 5,
                    color: "#a855f7",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    cursor:
                      !isRunning || !!actionLoading ? "not-allowed" : "pointer",
                    opacity: !isRunning ? 0.3 : 1,
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          );
        })}

        {containers.length === 0 && !error && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontFamily: "'Space Mono', monospace",
              color: "rgba(255,255,255,0.25)",
              fontSize: 12,
            }}
          >
            No containers found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Files View ────────────────────────────────────────────────────────────────

function FilesView() {
  const [path, setPath] = useState("/root");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathHistory = useRef<string[]>([]);

  const fetchFiles = useCallback(async (targetPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/files?path=${encodeURIComponent(targetPath)}`,
      );
      if (!res.ok) throw new Error("Failed to list directory");
      const data = await res.json();
      setFiles(data.files ?? []);
      setPath(targetPath);
      setSelected(null);
    } catch {
      setError("Cannot read directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(path);
  }, []); // eslint-disable-line

  const navigateTo = (entry: FileEntry) => {
    if (entry.type !== "dir") return;
    pathHistory.current.push(path);
    fetchFiles(`${path}/${entry.name}`);
  };

  const goBack = () => {
    const prev = pathHistory.current.pop();
    if (prev) fetchFiles(prev);
  };

  const downloadFile = async (filename: string) => {
    const fullPath = `${path}/${filename}`;
    const url = `/api/files?path=${encodeURIComponent(fullPath)}&download=1`;
    // Create a hidden link to trigger downloads.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("path", path);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      await fetchFiles(path); // refetch after upload
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      {/* Path bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={goBack}
          disabled={pathHistory.current.length === 0}
          style={{
            padding: "5px 10px",
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.2)",
            borderRadius: 5,
            color: "#a855f7",
            cursor:
              pathHistory.current.length === 0 ? "not-allowed" : "pointer",
            opacity: pathHistory.current.length === 0 ? 0.4 : 1,
            fontSize: 14,
          }}
        >
          ←
        </button>
        <div
          style={{
            flex: 1,
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.2)",
            borderRadius: 6,
            padding: "6px 12px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "#e0e0ff",
          }}
        >
          {path}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "5px 14px",
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.25)",
            borderRadius: 5,
            color: "#22d3ee",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            cursor: uploading ? "wait" : "pointer",
          }}
        >
          {uploading ? "Uploading..." : "↑ Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) uploadFile(e.target.files[0]);
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 8,
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {/* File table with drag-drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          flex: 1,
          border: `2px dashed ${dragging ? "rgba(34,211,238,0.6)" : "rgba(168,85,247,0.15)"}`,
          borderRadius: 12,
          overflow: "auto",
          transition: "all 0.2s",
          background: dragging ? "rgba(34,211,238,0.03)" : "transparent",
          position: "relative",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              fontFamily: "'Space Mono', monospace",
              color: "rgba(255,255,255,0.25)",
              fontSize: 12,
            }}
          >
            Loading...
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Name", "Size", "Modified", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      color: "rgba(255,255,255,0.3)",
                      fontWeight: 400,
                      letterSpacing: "0.1em",
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files
                // Sorting: Folders first, then by name.
                .sort((a, b) => {
                  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((f) => (
                  <tr
                    key={f.name}
                    onClick={() =>
                      f.type === "dir" ? navigateTo(f) : setSelected(f.name)
                    }
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      background:
                        selected === f.name
                          ? "rgba(168,85,247,0.08)"
                          : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 16px",
                        color: f.type === "dir" ? "#22d3ee" : "#e0e0ff",
                      }}
                    >
                      <span style={{ marginRight: 10, opacity: 0.6 }}>
                        {f.type === "dir" ? "📁" : "📄"}
                      </span>
                      {f.name}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      {f.type === "dir" ? "—" : formatSize(f.size)}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      {f.modified}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      {f.type === "file" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(f.name);
                          }}
                          style={{
                            padding: "3px 10px",
                            background: "rgba(74,222,128,0.08)",
                            border: "1px solid rgba(74,222,128,0.22)",
                            borderRadius: 4,
                            color: "#4ade80",
                            fontFamily: "'Space Mono', monospace",
                            fontSize: 10,
                            cursor: "pointer",
                          }}
                        >
                          ↓ DL
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              {files.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: "rgba(255,255,255,0.2)",
                    }}
                  >
                    Empty directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {dragging && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              background: "rgba(34,211,238,0.04)",
            }}
          >
            <span
              style={{
                color: "#22d3ee",
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                textShadow: "0 0 20px rgba(34,211,238,0.8)",
              }}
            >
              Drop to upload
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Home ────────────────────────────────────────────────────────────

function DashboardHome({
  metrics,
  containers,
  setActive,
}: {
  metrics: Metrics;
  containers: Container[];
  setActive: (id: string) => void;
}) {
  const statCards = [
    {
      label: "CPU Usage",
      value: metrics.cpu,
      color: "purple",
      textColor: "#a855f7",
    },
    {
      label: "RAM Usage",
      value: metrics.ram,
      color: "cyan",
      textColor: "#22d3ee",
    },
    {
      label: "Disk Usage",
      value: metrics.disk,
      color: "green",
      textColor: "#4ade80",
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Stat bars */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {statCards.map((s) => (
          <div
            key={s.label}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
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
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 18,
                  fontWeight: 700,
                  color: s.textColor,
                  textShadow: `0 0 10px ${s.textColor}`,
                }}
              >
                {Math.round(s.value)}%
              </span>
            </div>
            <GlowBar value={s.value} color={s.color} />
          </div>
        ))}
      </div>

      {/* System info + containers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            System
          </div>
          {[
            ["Uptime", metrics.uptime],
            ["Load Avg", metrics.load],
            ["IP", process.env.NEXT_PUBLIC_VPS_HOST ?? "—"],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
              <span style={{ color: "#e0e0ff" }}>{v}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Containers
          </div>
          {containers.slice(0, 5).map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: c.state === "running" ? "#4ade80" : "#6b7280",
                  boxShadow:
                    c.state === "running"
                      ? "0 0 6px rgba(74,222,128,0.8)"
                      : "none",
                }}
              />
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 12,
                  color: "#e0e0ff",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name}
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: c.state === "running" ? "#4ade80" : "#6b7280",
                  flexShrink: 0,
                }}
              >
                {c.state}
              </span>
            </div>
          ))}
          {containers.length === 0 && (
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
              }}
            >
              No containers
            </div>
          )}
        </div>
      </div>

      {/* Quick nav */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        {[
          {
            id: "terminal",
            label: "Terminal",
            desc: "SSH Console",
            icon: "❯_",
            color: "#a855f7",
          },
          {
            id: "monitor",
            label: "Monitor",
            desc: "Realtime Metrics",
            icon: "◈",
            color: "#22d3ee",
          },
          {
            id: "docker",
            label: "Docker",
            desc: "Containers",
            icon: "⊡",
            color: "#4ade80",
          },
          {
            id: "files",
            label: "Files",
            desc: "SFTP Explorer",
            icon: "◫",
            color: "#f59e0b",
          },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                item.color + "44";
              (e.currentTarget as HTMLButtonElement).style.background =
                item.color + "0a";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "rgba(255,255,255,0.07)";
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.02)";
            }}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "18px 16px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 22,
                color: item.color,
                textShadow: `0 0 12px ${item.color}`,
              }}
            >
              {item.icon}
            </span>
            <div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  color: "#e0e0ff",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 10,
                  marginTop: 3,
                }}
              >
                {item.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Root Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  const [time, setTime] = useState("");

  // Metrics state
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [metricsHistory, setMetricsHistory] = useState<{
    cpu: number[];
    ram: number[];
    disk: number[];
  }>({
    cpu: [],
    ram: [],
    disk: [],
  });

  // Containers state — fetch it from root so the Home Dashboard also sees it.
  const [containers, setContainers] = useState<Container[]>([]);

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("vi-VN"));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // SSE metrics — open a single connection, used for both Dashboard home and Monitor tab
  useEffect(() => {
    const es = new EventSource("/api/metrics");
    es.onmessage = (e) => {
      try {
        const data: Metrics = JSON.parse(e.data);
        setMetrics(data);
        // Keep a maximum of 30 history points for sparkline.
        setMetricsHistory((prev) => ({
          cpu: [...prev.cpu.slice(-29), data.cpu],
          ram: [...prev.ram.slice(-29), data.ram],
          disk: [...prev.disk.slice(-29), data.disk],
        }));
      } catch {
        /* ignore parse errors */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  // // Fetch containers at root (used for Dashboard home overview)
  useEffect(() => {
    fetch("/api/docker")
      .then((r) => (r.ok ? r.json() : { containers: [] }))
      .then((d) => setContainers(d.containers ?? []))
      .catch(() => {});
  }, []);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  };

  const views: Record<string, React.ReactNode> = {
    dashboard: (
      <DashboardHome
        metrics={metrics}
        containers={containers}
        setActive={setActive}
      />
    ),
    terminal: <TerminalView />,
    monitor: <MonitorView metrics={metrics} history={metricsHistory} />,
    docker: <DockerView />,
    files: <FilesView />,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080812; color: #e0e0ff; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.3); border-radius: 2px; }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <aside
          style={{
            width: 220,
            background: "rgba(10,8,25,0.97)",
            borderRight: "1px solid rgba(168,85,247,0.12)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: "22px 20px 18px",
              borderBottom: "1px solid rgba(168,85,247,0.1)",
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 15,
                fontWeight: 700,
                color: "#a855f7",
                textShadow: "0 0 20px rgba(168,85,247,0.8)",
                letterSpacing: "0.05em",
              }}
            >
              ⬡ VPS Control
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                marginTop: 4,
                letterSpacing: "0.08em",
              }}
            >
              {process.env.NEXT_PUBLIC_VPS_USER ?? "jokholk"}@
              {process.env.NEXT_PUBLIC_VPS_HOST ?? "—"}
            </div>
          </div>

          {/* Nav */}
          <nav
            style={{
              flex: 1,
              padding: "12px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  background:
                    active === item.id
                      ? "rgba(168,85,247,0.15)"
                      : "transparent",
                  borderLeft: `2px solid ${active === item.id ? "#a855f7" : "transparent"}`,
                  color:
                    active === item.id ? "#e0e0ff" : "rgba(255,255,255,0.4)",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 12,
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: "all 0.2s",
                }}
              >
                <span
                  style={{
                    color:
                      active === item.id ? "#a855f7" : "rgba(255,255,255,0.25)",
                    textShadow:
                      active === item.id
                        ? "0 0 8px rgba(168,85,247,0.8)"
                        : "none",
                    fontSize: 14,
                  }}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div
            style={{
              padding: "14px 16px",
              borderTop: "1px solid rgba(168,85,247,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#4ade80",
                  boxShadow: "0 0 8px rgba(74,222,128,0.8)",
                  animation: "pulse 2s infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                Connected
              </span>
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.25)",
                marginBottom: 12,
              }}
            >
              {time}
            </div>
            <button
              onClick={logout}
              style={{
                width: "100%",
                padding: "7px",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 6,
                color: "#f87171",
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              LOGOUT
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Topbar */}
          <header
            style={{
              height: 52,
              borderBottom: "1px solid rgba(168,85,247,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              background: "rgba(8,6,20,0.8)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: "rgba(168,85,247,0.6)",
                }}
              >
                ~/
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                {NAV_ITEMS.find((n) => n.id === active)?.label}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 20,
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              <span>
                CPU{" "}
                <span style={{ color: "#a855f7" }}>
                  {Math.round(metrics.cpu)}%
                </span>
              </span>
              <span>
                RAM{" "}
                <span style={{ color: "#22d3ee" }}>
                  {Math.round(metrics.ram)}%
                </span>
              </span>
              <span>
                Disk{" "}
                <span style={{ color: "#4ade80" }}>
                  {Math.round(metrics.disk)}%
                </span>
              </span>
            </div>
          </header>

          {/* View content */}
          <div
            key={active}
            style={{
              flex: 1,
              overflowY: "auto",
              animation: "fadeIn 0.2s ease",
            }}
          >
            {views[active]}
          </div>
        </main>
      </div>
    </>
  );
}
