"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Metrics {
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
type TabId =
  | "home"
  | "terminal"
  | "monitor"
  | "docker"
  | "pm2"
  | "files"
  | "cv"
  | "settings";
type S = {
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
function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}
function fmtKB(kb: number) {
  return fmt(kb * 1024);
}
function fmtUptime(ms: number | null) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Bar({ pct, color = "#8060d0" }: { pct: number; color?: string }) {
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

function Sparkline({ data, color }: { data: number[]; color: string }) {
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

function NetworkChart({
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

function StatusDot({ status }: { status: string }) {
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

function InfoRow({ k, v, s }: { k: string; v: string; s: S }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        fontSize: 12,
      }}
    >
      <span style={{ color: s.muted }}>{k}</span>
      <span style={{ color: s.text }}>{v}</span>
    </div>
  );
}

// ─── Styles type ──────────────────────────────────────────────────────────────
type S2 = S;

// ─── FileEditor ───────────────────────────────────────────────────────────────
function FileEditor({
  fileContent,
  filePath,
  authFetch,
  onClose,
  downloadFile,
  s,
}: {
  fileContent: { name: string; content: string };
  filePath: string;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response | null>;
  onClose: () => void;
  downloadFile: (path: string) => void;
  s: S2;
}) {
  const savedContent = useRef(fileContent.content);
  const [editContent, setEditContent] = useState(fileContent.content);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const isDirty = editContent !== savedContent.current;
  const fullPath = `${filePath}/${fileContent.name}`;

  const handleSave = async () => {
    setSaving(true);
    const res = await authFetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fullPath, content: editContent }),
    });
    setSaving(false);
    if (res?.ok) {
      savedContent.current = editContent;
      setSaveMsg("Saved ✓");
    } else setSaveMsg("Failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const btn = (color: string, border?: string): React.CSSProperties => ({
    padding: "5px 12px",
    background: "transparent",
    border: `0.5px solid ${border ?? "rgba(255,255,255,0.12)"}`,
    borderRadius: 7,
    color,
    fontFamily: s.mono,
    fontSize: 11,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        background: s.surface,
        border: `0.5px solid ${s.border}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            color: s.cyan,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fileContent.name}
          {isDirty && !saveMsg && (
            <span style={{ color: s.amber, marginLeft: 8, fontSize: 10 }}>
              ● modified
            </span>
          )}
          {saveMsg && (
            <span
              style={{
                color: saveMsg.includes("✓") ? s.green : s.red,
                marginLeft: 8,
                fontSize: 10,
              }}
            >
              {saveMsg}
            </span>
          )}
        </span>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{
            ...btn(
              isDirty ? s.green : s.muted,
              isDirty ? "rgba(74,222,128,0.3)" : undefined,
            ),
            opacity: isDirty ? 1 : 0.35,
            cursor: isDirty ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => downloadFile(fullPath)}
          style={btn(s.purple, "rgba(168,85,247,0.3)")}
        >
          ↓
        </button>
        <button onClick={onClose} style={btn(s.muted)}>
          ✕
        </button>
      </div>
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          resize: "none",
          background: "rgba(0,0,0,0.3)",
          border: `0.5px solid ${isDirty ? "rgba(148,120,255,0.3)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 9,
          padding: "12px 14px",
          color: s.text,
          fontFamily: s.mono,
          fontSize: 12,
          lineHeight: 1.75,
          outline: "none",
          transition: "border-color 0.2s",
          minHeight: 200,
        }}
      />
    </div>
  );
}

// ─── DeployPanel ─────────────────────────────────────────────────────────────
type DeployStep = {
  step: string;
  status: "running" | "done" | "skipped";
  output?: string;
};

function DeployPanel({
  authFetch,
  s,
}: {
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S2;
}) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [gitInfo, setGitInfo] = useState<{
    hasUpdates: boolean;
    current: string;
    pending: string[];
  } | null>(null);
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  const checkUpdates = async () => {
    setChecking(true);
    setGitInfo(null);
    setSteps([]);
    setDone(null);
    const res = await authFetch("/api/deploy");
    if (res?.ok) setGitInfo(await res.json());
    setChecking(false);
  };

  const pollUntilBack = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/auth/token", { cache: "no-store" });
        if (res.ok || res.status === 401) {
          clearInterval(interval);
          window.location.href = "/dashboard";
        }
      } catch {}
      if (attempts > 30) {
        clearInterval(interval);
        setDone("Server may still be restarting. Refresh manually.");
        setDeploying(false);
      }
    }, 1000);
  };

  const runDeploy = async () => {
    setDeploying(true);
    setSteps([]);
    setDone(null);
    const res = await authFetch("/api/deploy", { method: "POST" });
    if (!res?.body) {
      setDeploying(false);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "",
      deployStarted = false;

    // Track live output per step
    const liveOutput: Record<string, string> = {};

    try {
      while (true) {
        const { done: sd, value } = await reader.read();
        if (sd) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const em = part.match(/^event: (\w+)/m);
          const dm = part.match(/^data: (.+)/m);
          if (!em || !dm) continue;
          const data = JSON.parse(dm[1]);

          if (em[1] === "step") {
            deployStarted = true;
            setSteps((prev) => {
              const idx = prev.findIndex((s) => s.step === data.step);
              // Merge accumulated live output into final step
              const merged = {
                ...data,
                output: data.output ?? liveOutput[data.step] ?? "",
              };
              if (idx >= 0) {
                const n = [...prev];
                n[idx] = merged;
                return n;
              }
              return [...prev, merged];
            });
          }

          // Realtime output chunks — append to running step
          if (em[1] === "output") {
            liveOutput[data.step] = (liveOutput[data.step] ?? "") + data.chunk;
            setSteps((prev) =>
              prev.map((s) =>
                s.step === data.step
                  ? { ...s, output: liveOutput[data.step] }
                  : s,
              ),
            );
          }

          if (em[1] === "done") setDone(data.message);
        }
      }
    } catch {}
    setDeploying(false);
    if (deployStarted) {
      setDone("Deploy triggered. Waiting for server to come back...");
      pollUntilBack();
    }
  };

  const sColor = (st: string) =>
    st === "done" ? s.green : st === "running" ? s.amber : s.muted;

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          checkUpdates();
        }}
        style={{
          padding: "8px 16px",
          background: "rgba(128,96,208,0.15)",
          border: "0.5px solid rgba(148,120,255,0.4)",
          borderRadius: 9,
          color: "#c4adff",
          fontFamily: s.mono,
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
          whiteSpace: "nowrap",
        }}
      >
        ⬆ Deploy
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(8,8,16,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: 560,
              background: "#0f0f1e",
              border: "0.5px solid rgba(148,120,255,0.2)",
              borderRadius: 16,
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 500, color: "#c4adff" }}>
                Deploy Update
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: s.muted,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            {checking && (
              <div style={{ fontSize: 12, color: s.muted }}>
                Checking remote...
              </div>
            )}
            {gitInfo && (
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    color: s.muted,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    marginBottom: 5,
                  }}
                >
                  CURRENT
                </div>
                <div
                  style={{
                    color: s.text,
                    marginBottom: 12,
                    fontFamily: s.mono,
                  }}
                >
                  {gitInfo.current}
                </div>
                {gitInfo.hasUpdates ? (
                  <>
                    <div
                      style={{
                        color: s.amber,
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        marginBottom: 5,
                      }}
                    >
                      PENDING
                    </div>
                    {gitInfo.pending.map((l, i) => (
                      <div
                        key={i}
                        style={{
                          color: s.text,
                          fontFamily: s.mono,
                          fontSize: 11,
                          padding: "2px 0",
                        }}
                      >
                        · {l}
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ color: s.green, fontSize: 11 }}>
                    ✓ Already up to date
                  </div>
                )}
              </div>
            )}
            {steps.length > 0 && (
              <div
                ref={logRef}
                style={{
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: 10,
                  padding: 14,
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {steps.map((step, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ color: sColor(step.status) }}>
                        {step.status === "done"
                          ? "✓"
                          : step.status === "running"
                            ? "⟳"
                            : "–"}
                      </span>
                      <span style={{ color: s.text, fontWeight: 500 }}>
                        {step.step}
                      </span>
                      <span style={{ color: s.muted, fontSize: 10 }}>
                        {step.status}
                      </span>
                    </div>
                    {step.output && (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 10,
                          color: s.muted,
                          fontFamily: s.mono,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          paddingLeft: 18,
                          lineHeight: 1.6,
                        }}
                      >
                        {step.output.slice(-600)}
                      </pre>
                    )}
                  </div>
                ))}
                {done && (
                  <div style={{ color: s.green, fontSize: 12, marginTop: 4 }}>
                    ✓ {done}
                  </div>
                )}
              </div>
            )}
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={checkUpdates}
                disabled={checking || deploying}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 8,
                  color: s.muted,
                  fontFamily: s.mono,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {checking ? "Checking..." : "↻ Refresh"}
              </button>
              <button
                onClick={runDeploy}
                disabled={deploying || checking}
                style={{
                  padding: "8px 20px",
                  background: "rgba(128,96,208,0.2)",
                  border: "0.5px solid rgba(148,120,255,0.4)",
                  borderRadius: 8,
                  color: "#c4adff",
                  fontFamily: s.mono,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  opacity: deploying ? 0.6 : 1,
                }}
              >
                {deploying ? "Deploying..." : "⬆ Deploy Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Settings tab component — embedded in dashboard_page.tsx
// Paste this before the Main component

// ─── Module config definitions ───────────────────────────────────────────────
const MODULE_DEFS = [
  {
    id: "metrics",
    label: "Monitor",
    icon: "◈",
    envKey: "ENABLE_METRICS",
    fields: [] as Field[],
  },
  {
    id: "docker",
    label: "Docker",
    icon: "▣",
    envKey: "ENABLE_DOCKER",
    fields: [] as Field[],
  },
  {
    id: "pm2",
    label: "PM2",
    icon: "⟳",
    envKey: "ENABLE_PM2",
    fields: [] as Field[],
  },
  {
    id: "files",
    label: "Files",
    icon: "⊟",
    envKey: "ENABLE_FILES",
    fields: [] as Field[],
  },
  {
    id: "cv",
    label: "CV Editor",
    icon: "✎",
    envKey: "NEXT_PUBLIC_ENABLE_CV",
    fields: [
      {
        key: "CV_SERVICE_URL",
        label: "CV Service URL",
        placeholder: "http://localhost:4321",
      },
    ],
  },
] as const;

interface Field {
  key: string;
  label: string;
  placeholder: string;
}

interface HealthResult {
  ok: boolean;
  reason?: string;
}

function SettingsTab({
  authFetch,
  s,
}: {
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}) {
  const [envData, setEnvData] = useState<Record<string, string> | null>(null);
  const [health, setHealth] = useState<Record<string, HealthResult> | null>(
    null,
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Core connection fields
  const CORE_FIELDS = [
    { key: "VPS_HOST", label: "VPS Host", placeholder: "103.77.243.5" },
    { key: "VPS_USER", label: "VPS User", placeholder: "root" },
    {
      key: "REDIS_URL",
      label: "Redis URL",
      placeholder: "redis://localhost:6380",
    },
    {
      key: "VPS_PRIVATE_KEY_PATH",
      label: "SSH Key Path",
      placeholder: "./keys/id_rsa",
    },
    {
      key: "NEXT_PUBLIC_VPS_HOST",
      label: "Public VPS Host",
      placeholder: "103.77.243.5",
    },
    {
      key: "NEXT_PUBLIC_VPS_USER",
      label: "Public VPS User",
      placeholder: "root",
    },
  ];

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await authFetch("/api/settings");
      if (res?.ok) {
        const data = await res.json();
        setEnvData(data.env);
        setHealth(data.health);
        // Pre-fill edits with current values
        setEdits(data.env ?? {});
      }
      setLoading(false);
    })();
  }, [authFetch]);

  const isEnabled = (envKey: string): boolean => {
    const val = edits[envKey] ?? envData?.[envKey] ?? "true";
    return val !== "false";
  };

  const toggleModule = (envKey: string) => {
    const current = isEnabled(envKey);
    setEdits((prev) => ({ ...prev, [envKey]: current ? "false" : "true" }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    // Only send changed values
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(edits)) {
      if (v !== (envData?.[k] ?? "")) updates[k] = v;
    }

    const res = await authFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, restart: ["console-ssh"] }),
    });

    setSaving(false);
    if (res?.ok) {
      setSaveMsg("Saved ✓ — restarting...");
      setTimeout(() => (window.location.href = "/dashboard"), 4000);
    } else {
      setSaveMsg("Save failed");
    }
  };

  const healthDot = (key: string) => {
    if (!health) return null;
    const h = health[key];
    if (!h) return null;
    return (
      <span
        title={h.reason ?? "OK"}
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: h.ok ? "#4ade80" : "#f87171",
          boxShadow: h.ok ? "0 0 5px rgba(74,222,128,0.6)" : "none",
          marginLeft: 8,
          verticalAlign: "middle",
        }}
      />
    );
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#080810",
    border: `0.5px solid rgba(255,255,255,0.1)`,
    borderRadius: 8,
    padding: "9px 13px",
    color: s.text,
    fontFamily: s.mono,
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  if (loading)
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 0",
          color: s.muted,
          fontSize: 13,
        }}
      >
        Loading settings...
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 720,
      }}
    >
      {/* Core connection */}
      <div style={card()}>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            letterSpacing: "0.13em",
            marginBottom: 16,
          }}
        >
          CORE CONNECTION
          {healthDot("redis")}
          {health?.redis && !health.redis.ok && (
            <span style={{ marginLeft: 8, fontSize: 10, color: s.red }}>
              {health.redis.reason}
            </span>
          )}
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {CORE_FIELDS.map((f) => (
            <div key={f.key}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: s.muted,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                {f.label}
              </label>
              <input
                value={edits[f.key] ?? ""}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Module toggles */}
      <div style={card()}>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            letterSpacing: "0.13em",
            marginBottom: 16,
          }}
        >
          MODULES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MODULE_DEFS.map((mod) => {
            const on = isEnabled(mod.envKey);
            const hkey =
              mod.id === "cv"
                ? "cv"
                : mod.id === "docker"
                  ? "docker"
                  : undefined;
            return (
              <div
                key={mod.id}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: on
                      ? "rgba(128,96,208,0.08)"
                      : "rgba(255,255,255,0.02)",
                    border: `0.5px solid ${on ? "rgba(148,120,255,0.25)" : s.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span
                    style={{ fontSize: 16, width: 20, textAlign: "center" }}
                  >
                    {mod.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: s.text }}>
                    {mod.label}
                    {hkey && healthDot(hkey)}
                    {hkey && health?.[hkey] && !health[hkey].ok && (
                      <span
                        style={{ marginLeft: 8, fontSize: 10, color: s.red }}
                      >
                        {health[hkey].reason}
                      </span>
                    )}
                  </span>
                  {/* Toggle switch */}
                  <div
                    onClick={() => toggleModule(mod.envKey)}
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      background: on
                        ? "rgba(148,120,255,0.4)"
                        : "rgba(255,255,255,0.08)",
                      border: `0.5px solid ${on ? "rgba(148,120,255,0.5)" : s.border}`,
                      position: "relative",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: on ? s.purple : s.muted,
                        position: "absolute",
                        top: 2,
                        left: on ? 20 : 2,
                        transition: "left 0.2s",
                      }}
                    />
                  </div>
                </div>
                {/* Module-specific fields — show only when enabled */}
                {on && mod.fields.length > 0 && (
                  <div
                    style={{
                      paddingLeft: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {mod.fields.map((f) => (
                      <div key={f.key}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 10,
                            color: s.muted,
                            letterSpacing: "0.1em",
                            marginBottom: 6,
                          }}
                        >
                          {f.label}
                        </label>
                        <input
                          value={edits[f.key] ?? ""}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={f.placeholder}
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {saveMsg && (
          <span
            style={{
              fontSize: 12,
              color: saveMsg.includes("✓") ? s.green : s.red,
            }}
          >
            {saveMsg}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 24px",
            background: "rgba(128,96,208,0.2)",
            border: "0.5px solid rgba(148,120,255,0.4)",
            borderRadius: 9,
            color: s.purple,
            fontFamily: s.mono,
            fontSize: 12,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save & Restart"}
        </button>
      </div>

      {/* Warning */}
      <div
        style={{
          fontSize: 11,
          color: s.muted,
          lineHeight: 1.6,
          padding: "10px 14px",
          background: "rgba(245,158,11,0.05)",
          border: "0.5px solid rgba(245,158,11,0.15)",
          borderRadius: 9,
        }}
      >
        ⚠ Saving will write to <code style={{ color: s.amber }}>.env</code> and
        restart the <code style={{ color: s.amber }}>console-ssh</code> process.
        Dashboard will reload in ~4 seconds.
      </div>
    </div>
  );
}

// ─── CV Editor ───────────────────────────────────────────────────────────────
function CvEditor({
  authFetch,
  s,
}: {
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [md, setMd] = useState("");
  const [css, setCss] = useState("");
  const [activePanel, setActivePanel] = useState<"md" | "css">("md");
  const [loading, setLoading] = useState(false);
  const [savingMd, setSavingMd] = useState(false);
  const [savingCss, setSavingCss] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load MD when lang changes
  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await authFetch(`/api/cv/md?lang=${lang}`);
      if (res?.ok) {
        const { content } = await res.json();
        setMd(content);
      }
      setLoading(false);
    })();
  }, [lang, authFetch]);

  // Load CSS once on mount
  useEffect(() => {
    (async () => {
      const res = await authFetch("/api/cv/css");
      if (res?.ok) {
        const { content } = await res.json();
        setCss(content);
      }
    })();
  }, [authFetch]);

  // Debounced live preview — re-render when MD or CSS changes
  useEffect(() => {
    if (!md) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch("/api/cv/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, md, css }),
      });
      if (res.ok && previewRef.current)
        previewRef.current.srcdoc = await res.text();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [md, css, lang]);

  const handleSaveMd = async () => {
    setSavingMd(true);
    const res = await authFetch("/api/cv/md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, content: md }),
    });
    setSavingMd(false);
    setSaveMsg(res?.ok ? "MD saved ✓" : "Save failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleSaveCss = async () => {
    setSavingCss(true);
    const res = await authFetch("/api/cv/css", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: css }),
    });
    setSavingCss(false);
    setSaveMsg(res?.ok ? "CSS saved ✓" : "Save failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/cv/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, md, css }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = lang === "vi" ? "CV_PhucThai_VI.pdf" : "CV_PhucThai_EN.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + String(err));
    }
    setExporting(false);
  };

  const btn = (
    color: string,
    border: string,
    bg = "transparent",
  ): React.CSSProperties => ({
    padding: "7px 16px",
    background: bg,
    border: `0.5px solid ${border}`,
    borderRadius: 8,
    color,
    fontFamily: s.mono,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        gap: 12,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Lang */}
        <div
          style={{
            display: "flex",
            border: `0.5px solid ${s.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {(["vi", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: "7px 16px",
                background: lang === l ? "rgba(128,96,208,0.2)" : "transparent",
                border: "none",
                color: lang === l ? s.purple : s.muted,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Panel toggle */}
        <div
          style={{
            display: "flex",
            border: `0.5px solid ${s.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {(["md", "css"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setActivePanel(p)}
              style={{
                padding: "7px 16px",
                background:
                  activePanel === p ? "rgba(128,96,208,0.2)" : "transparent",
                border: "none",
                color: activePanel === p ? s.purple : s.muted,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {p === "md" ? "Markdown" : "CSS"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {saveMsg && (
          <span
            style={{
              fontSize: 12,
              color: saveMsg.includes("✓") ? s.green : s.red,
            }}
          >
            {saveMsg}
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 12, color: s.amber }}>Loading...</span>
        )}

        {activePanel === "md" ? (
          <button
            onClick={handleSaveMd}
            disabled={savingMd || loading}
            style={{
              ...btn(s.green, "rgba(74,222,128,0.3)"),
              opacity: savingMd ? 0.5 : 1,
            }}
          >
            {savingMd ? "Saving..." : "Save MD"}
          </button>
        ) : (
          <button
            onClick={handleSaveCss}
            disabled={savingCss}
            style={{
              ...btn(s.cyan, "rgba(56,189,248,0.3)"),
              opacity: savingCss ? 0.5 : 1,
            }}
          >
            {savingCss ? "Saving..." : "Save CSS"}
          </button>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || loading}
          style={{
            ...btn("#c4adff", "rgba(148,120,255,0.4)", "rgba(128,96,208,0.18)"),
            opacity: exporting ? 0.5 : 1,
          }}
        >
          {exporting ? "Generating..." : "⬇ Export PDF"}
        </button>

        <a
          href={`/api/cv/export?lang=${lang}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btn(s.muted, s.border), textDecoration: "none" }}
        >
          ↗ Public
        </a>
      </div>

      {/* Editor + Preview */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          minHeight: 0,
        }}
      >
        {/* Left: MD or CSS editor */}
        <div
          style={{
            background: s.surface,
            border: `0.5px solid ${s.border}`,
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: `0.5px solid ${s.border}`,
              fontSize: 11,
              color: s.muted,
              letterSpacing: "0.1em",
            }}
          >
            {activePanel === "md"
              ? `MARKDOWN — resume-${lang}.md`
              : "CSS — styles.css"}
          </div>
          <textarea
            value={activePanel === "md" ? md : css}
            onChange={(e) =>
              activePanel === "md"
                ? setMd(e.target.value)
                : setCss(e.target.value)
            }
            spellCheck={false}
            placeholder={activePanel === "md" ? "Loading..." : "Loading CSS..."}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              padding: "14px 16px",
              color: activePanel === "css" ? s.cyan : s.text,
              fontFamily: s.mono,
              fontSize: 12,
              lineHeight: 1.75,
              outline: "none",
            }}
          />
        </div>

        {/* Right: Preview */}
        <div
          style={{
            background: "#fff",
            border: `0.5px solid ${s.border}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "0.5px solid #eee",
              fontSize: 11,
              color: "#888",
              letterSpacing: "0.1em",
              background: "#fafafa",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>PREVIEW — A4</span>
            <span style={{ fontSize: 10, color: "#bbb" }}>
              live · 500ms debounce
            </span>
          </div>
          <iframe
            ref={previewRef}
            title="CV Preview"
            style={{ flex: 1, border: "none", background: "#fff" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Footer links */}
      <div style={{ fontSize: 11, color: s.muted }}>
        Download link:
        <code
          style={{
            margin: "0 8px",
            color: s.cyan,
            background: "rgba(0,0,0,0.2)",
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          /api/cv/export?lang=vi
        </code>
        <code
          style={{
            color: s.cyan,
            background: "rgba(0,0,0,0.2)",
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          /api/cv/export?lang=en
        </code>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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

      {/* Sidebar */}
      <aside
        style={{
          width: 210,
          borderRight: `0.5px solid ${s.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "#0b0b18",
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
              <div style={{ fontSize: 13, fontWeight: 500, color: "#ede8ff" }}>
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
              onClick={() => setTab(t.id as TabId)}
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
          style={{ padding: "14px 18px", borderTop: `0.5px solid ${s.border}` }}
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
                boxShadow: connected ? `0 0 5px rgba(74,222,128,0.7)` : "none",
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
            gap: 16,
            flexShrink: 0,
          }}
        >
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              {[
                {
                  label: "CPU USAGE",
                  value: metrics?.cpu ?? 0,
                  color: "#8060d0",
                  bar: "#8060d0",
                },
                {
                  label: "MEMORY",
                  value: metrics?.ram.pct ?? 0,
                  color: s.cyan,
                  bar: "#0ea5e9",
                },
                {
                  label: "DISK",
                  value: metrics?.disk.pct ?? 0,
                  color: s.green,
                  bar: "#22c55e",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ ...card(), borderTop: `2px solid ${item.bar}` }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: s.muted,
                      letterSpacing: "0.13em",
                      marginBottom: 8,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 500,
                      color: item.color,
                      marginBottom: 8,
                      lineHeight: 1,
                    }}
                  >
                    {item.value}%
                  </div>
                  <Bar pct={item.value} color={item.bar} />
                </div>
              ))}
              <div style={{ ...card(), gridColumn: "1 / 3" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.13em",
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
                      ? `${metrics.load["1m"]} · ${metrics.load["5m"]} · ${metrics.load["15m"]}`
                      : "—",
                  ],
                  ["IP", process.env.NEXT_PUBLIC_VPS_HOST ?? "—"],
                  [
                    "Network ↓",
                    metrics ? `${fmt(metrics.network.rxSec)}/s` : "—",
                  ],
                  [
                    "Network ↑",
                    metrics ? `${fmt(metrics.network.txSec)}/s` : "—",
                  ],
                ].map(([k, v]) => (
                  <InfoRow key={k} k={k} v={v} s={s} />
                ))}
              </div>
              <div style={card()}>
                <div
                  style={{
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.13em",
                    marginBottom: 12,
                  }}
                >
                  PM2 PROCESSES
                </div>
                {pm2List.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: s.muted,
                      textAlign: "center",
                      padding: "16px 0",
                    }}
                  >
                    No processes
                  </div>
                ) : (
                  pm2List.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "7px 0",
                        borderBottom: `1px solid rgba(255,255,255,0.05)`,
                        fontSize: 12,
                      }}
                    >
                      <StatusDot status={p.status} />
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                      <span style={{ fontSize: 11, color: s.purple }}>
                        {p.cpu}%
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: s.muted,
                          width: 52,
                          textAlign: "right",
                        }}
                      >
                        {fmt(p.memory)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ ...card(), gridColumn: "1 / 4" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: s.muted,
                    letterSpacing: "0.13em",
                    marginBottom: 14,
                  }}
                >
                  QUICK ACCESS
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
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
                        sub: "Realtime",
                      },
                      {
                        id: "docker",
                        icon: "▣",
                        label: "Docker",
                        sub: "Containers",
                      },
                      { id: "pm2", icon: "⟳", label: "PM2", sub: "Processes" },
                      { id: "files", icon: "⊟", label: "Files", sub: "SFTP" },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      style={{
                        background: "rgba(255,255,255,0.025)",
                        border: `0.5px solid ${s.border}`,
                        borderRadius: 12,
                        padding: "14px 10px",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          "rgba(148,120,255,0.35)";
                        e.currentTarget.style.background =
                          "rgba(128,96,208,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = s.border;
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.025)";
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 7 }}>
                        {item.icon}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {item.label}
                      </div>
                      <div
                        style={{ fontSize: 10, color: s.muted, marginTop: 3 }}
                      >
                        {item.sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
          {tab === "monitor" && metrics && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              {/* CPU */}
              <div style={{ ...card(), borderTop: "2px solid #8060d0" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: s.muted,
                        letterSpacing: "0.13em",
                        marginBottom: 6,
                      }}
                    >
                      CPU
                    </div>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 500,
                        color: s.purple,
                        lineHeight: 1,
                      }}
                    >
                      {metrics.cpu}%
                    </div>
                  </div>
                  <Sparkline data={cpuHistory} color={s.purple} />
                </div>
                <Bar pct={metrics.cpu} color="#8060d0" />
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2px 16px",
                  }}
                >
                  {(
                    [
                      [
                        "Cores",
                        `${metrics.cpuInfo.cores}c / ${metrics.cpuInfo.threads}t`,
                      ],
                      ["Freq", `${metrics.cpuInfo.curFreqMhz} MHz`],
                      ["Max freq", `${metrics.cpuInfo.maxFreqMhz} MHz`],
                      ["Load 1m", metrics.load["1m"]],
                      ["Load 5m", metrics.load["5m"]],
                      ["Load 15m", metrics.load["15m"]],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <InfoRow key={k} k={k} v={v} s={s} />
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    color: s.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {metrics.cpuInfo.model}
                </div>
              </div>

              {/* RAM */}
              <div style={{ ...card(), borderTop: "2px solid #0ea5e9" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: s.muted,
                        letterSpacing: "0.13em",
                        marginBottom: 6,
                      }}
                    >
                      MEMORY
                    </div>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 500,
                        color: s.cyan,
                        lineHeight: 1,
                      }}
                    >
                      {metrics.ram.pct}%
                    </div>
                  </div>
                  <Sparkline data={ramHistory} color={s.cyan} />
                </div>
                <Bar pct={metrics.ram.pct} color="#0ea5e9" />
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2px 16px",
                  }}
                >
                  {(
                    [
                      ["Used", fmtKB(metrics.ram.used)],
                      ["Free", fmtKB(metrics.ram.free)],
                      ["Buffers", fmtKB(metrics.ram.buffers)],
                      ["Cached", fmtKB(metrics.ram.cached)],
                      ["Total", fmtKB(metrics.ram.total)],
                      [
                        "Swap",
                        metrics.ram.swapTotal > 0
                          ? `${fmtKB(metrics.ram.swapUsed)} / ${fmtKB(metrics.ram.swapTotal)}`
                          : "—",
                      ],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <InfoRow key={k} k={k} v={v} s={s} />
                  ))}
                </div>
              </div>

              {/* DISK */}
              <div style={{ ...card(), borderTop: "2px solid #22c55e" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.13em",
                    marginBottom: 6,
                  }}
                >
                  DISK
                </div>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 500,
                    color: s.green,
                    lineHeight: 1,
                    marginBottom: 10,
                  }}
                >
                  {metrics.disk.pct}%
                </div>
                <Bar pct={metrics.disk.pct} color="#22c55e" />
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2px 16px",
                    marginBottom: 14,
                  }}
                >
                  {(
                    [
                      ["Used", `${metrics.disk.used}MB`],
                      ["Free", `${metrics.disk.free}MB`],
                      ["Total", `${metrics.disk.total}MB`],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <InfoRow key={k} k={k} v={v} s={s} />
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 9,
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}
                    >
                      ▼ READ
                    </div>
                    <div
                      style={{ fontSize: 17, fontWeight: 500, color: s.green }}
                    >
                      {fmt(metrics.disk.readSec)}/s
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 9,
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}
                    >
                      ▲ WRITE
                    </div>
                    <div
                      style={{ fontSize: 17, fontWeight: 500, color: s.amber }}
                    >
                      {fmt(metrics.disk.writeSec)}/s
                    </div>
                  </div>
                </div>
              </div>

              {/* NETWORK */}
              <div style={{ ...card(), borderTop: "2px solid #0ea5e9" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.13em",
                    marginBottom: 12,
                  }}
                >
                  NETWORK
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 9,
                      padding: "12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}
                    >
                      ↓ DOWNLOAD
                    </div>
                    <div
                      style={{ fontSize: 20, fontWeight: 500, color: s.green }}
                    >
                      {fmt(metrics.network.rxSec)}/s
                    </div>
                    <div style={{ fontSize: 10, color: s.muted, marginTop: 4 }}>
                      total: {fmt(metrics.network.rxTotal)}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 9,
                      padding: "12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}
                    >
                      ↑ UPLOAD
                    </div>
                    <div
                      style={{ fontSize: 20, fontWeight: 500, color: s.purple }}
                    >
                      {fmt(metrics.network.txSec)}/s
                    </div>
                    <div style={{ fontSize: 10, color: s.muted, marginTop: 4 }}>
                      total: {fmt(metrics.network.txTotal)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Network chart */}
              <div style={{ ...card(), gridColumn: "1 / 3" }}>
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
                      fontSize: 10,
                      color: s.muted,
                      letterSpacing: "0.13em",
                    }}
                  >
                    NETWORK BANDWIDTH (realtime)
                  </span>
                  <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
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
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: 9,
                    padding: "6px 4px",
                    height: 76,
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
                    fontSize: 10,
                    color: s.muted,
                  }}
                >
                  <span>90s ago</span>
                  <span>now</span>
                </div>
              </div>
            </div>
          )}

          {/* ── DOCKER ── */}
          {tab === "docker" && (
            <div style={card()}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.13em",
                  }}
                >
                  CONTAINERS ({containers.length})
                </span>
                <button
                  onClick={fetchDocker}
                  style={{
                    padding: "5px 14px",
                    background: "transparent",
                    border: `0.5px solid ${s.border}`,
                    borderRadius: 7,
                    color: s.muted,
                    fontFamily: s.mono,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  ↻ Refresh
                </button>
              </div>
              {containers.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: s.muted,
                    fontSize: 13,
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
                      gap: 14,
                      padding: "12px 0",
                      borderBottom: `0.5px solid ${s.border}`,
                      fontSize: 13,
                    }}
                  >
                    <StatusDot status={c.State} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, marginBottom: 3 }}>
                        {c.Names[0]?.replace("/", "")}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: s.muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.Image} · {c.Status}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      {(["start", "stop", "restart"] as const).map((action) => (
                        <button
                          key={action}
                          onClick={() => {
                            authFetch("/api/docker", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: c.Id, action }),
                            }).then(() => fetchDocker());
                          }}
                          style={{
                            padding: "4px 10px",
                            background: "transparent",
                            border: `0.5px solid ${action === "stop" ? "rgba(248,113,113,0.25)" : action === "restart" ? "rgba(245,158,11,0.25)" : "rgba(74,222,128,0.25)"}`,
                            borderRadius: 6,
                            color:
                              action === "stop"
                                ? s.red
                                : action === "restart"
                                  ? s.amber
                                  : s.green,
                            fontFamily: s.mono,
                            fontSize: 10,
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

          {/* ── PM2 ── */}
          {tab === "pm2" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                height: "calc(100vh - 120px)",
              }}
            >
              {/* Process list */}
              <div
                style={{
                  ...card(),
                  flex: pm2Logs ? "0 0 auto" : 1,
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: s.muted,
                      letterSpacing: "0.13em",
                    }}
                  >
                    PROCESSES ({pm2List.length})
                  </span>
                  <button
                    onClick={fetchPm2}
                    style={{
                      padding: "7px 16px",
                      background: "transparent",
                      border: `0.5px solid ${s.border}`,
                      borderRadius: 8,
                      color: s.muted,
                      fontFamily: s.mono,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ↻ Refresh
                  </button>
                </div>
                {pm2List.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px 0",
                      color: s.muted,
                      fontSize: 14,
                    }}
                  >
                    No processes
                  </div>
                ) : (
                  pm2List.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: "14px 0",
                        borderBottom: `0.5px solid ${s.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <StatusDot status={p.status} />
                        <span
                          style={{ fontWeight: 500, fontSize: 14, flex: 1 }}
                        >
                          {p.name}
                        </span>
                        <span style={{ fontSize: 11, color: s.muted }}>
                          #{p.id} · {p.mode}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 20,
                          fontSize: 12,
                          color: s.muted,
                          marginBottom: 12,
                          paddingLeft: 19,
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
                            style={{
                              color:
                                p.restarts > 10
                                  ? s.red
                                  : p.restarts > 3
                                    ? s.amber
                                    : s.text,
                            }}
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
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          paddingLeft: 19,
                          flexWrap: "wrap",
                        }}
                      >
                        {(["restart", "stop", "start", "delete"] as const).map(
                          (action) => (
                            <button
                              key={action}
                              onClick={() =>
                                authFetch("/api/pm2", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ id: p.id, action }),
                                }).then(() => setTimeout(fetchPm2, 1000))
                              }
                              style={{
                                padding: "6px 14px",
                                background: "transparent",
                                border: `0.5px solid ${action === "delete" ? "rgba(248,113,113,0.3)" : action === "stop" ? "rgba(245,158,11,0.3)" : action === "restart" ? "rgba(196,173,255,0.25)" : "rgba(74,222,128,0.28)"}`,
                                borderRadius: 7,
                                color:
                                  action === "delete"
                                    ? s.red
                                    : action === "stop"
                                      ? s.amber
                                      : action === "restart"
                                        ? s.purple
                                        : s.green,
                                fontFamily: s.mono,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {action}
                            </button>
                          ),
                        )}
                        <button
                          onClick={() => {
                            logsRef.current?.close();
                            setPm2Logs({ name: p.name, lines: [] });
                            const es = new EventSource(
                              `/api/pm2/logs?name=${p.name}&lines=150`,
                            );
                            logsRef.current = es;
                            es.onmessage = (e) => {
                              const { line } = JSON.parse(e.data);
                              setPm2Logs((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      lines: [...prev.lines.slice(-299), line],
                                    }
                                  : null,
                              );
                            };
                            es.onerror = () => es.close();
                          }}
                          style={{
                            padding: "6px 14px",
                            background: "rgba(56,189,248,0.08)",
                            border: "0.5px solid rgba(56,189,248,0.25)",
                            borderRadius: 7,
                            color: s.cyan,
                            fontFamily: s.mono,
                            fontSize: 12,
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

              {/* Logs panel — bottom drawer, fixed height */}
              {pm2Logs && (
                <div
                  style={{
                    ...card(),
                    height: 280,
                    display: "flex",
                    flexDirection: "column",
                    flexShrink: 0,
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
                        fontSize: 11,
                        color: s.muted,
                        letterSpacing: "0.13em",
                      }}
                    >
                      LOGS —{" "}
                      <span style={{ color: s.cyan }}>{pm2Logs.name}</span>
                      <span
                        style={{ color: s.muted, marginLeft: 10, fontSize: 10 }}
                      >
                        ({pm2Logs.lines.length} lines)
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        logsRef.current?.close();
                        setPm2Logs(null);
                      }}
                      style={{
                        padding: "5px 12px",
                        background: "transparent",
                        border: `0.5px solid ${s.border}`,
                        borderRadius: 7,
                        color: s.muted,
                        fontFamily: s.mono,
                        fontSize: 11,
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
                      borderRadius: 9,
                      padding: "12px 14px",
                    }}
                  >
                    {pm2Logs.lines.length === 0 ? (
                      <div style={{ color: s.muted, fontSize: 12 }}>
                        Waiting for logs...
                      </div>
                    ) : (
                      pm2Logs.lines.map((line, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 12,
                            lineHeight: 1.7,
                            fontFamily: s.mono,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            color:
                              line.toLowerCase().includes("error") ||
                              line.toLowerCase().includes("err")
                                ? s.red
                                : line.toLowerCase().includes("warn")
                                  ? s.amber
                                  : "rgba(255,255,255,0.55)",
                          }}
                        >
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FILES ── */}
          {tab === "files" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: fileContent
                  ? "minmax(320px, 1fr) 1.5fr"
                  : "1fr",
                gap: 14,
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
                {/* Breadcrumb */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 14,
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
                            gap: 5,
                          }}
                        >
                          {i > 0 && (
                            <span style={{ color: s.muted, fontSize: 13 }}>
                              /
                            </span>
                          )}
                          <button
                            onClick={() => fetchFiles(p)}
                            style={{
                              background: "none",
                              border: "none",
                              color: i === arr.length - 1 ? s.text : s.purple,
                              fontFamily: s.mono,
                              fontSize: 13,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {seg}
                          </button>
                        </span>
                      );
                    })}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <label
                      style={{
                        padding: "6px 12px",
                        background: "rgba(148,120,255,0.1)",
                        border: "0.5px solid rgba(148,120,255,0.28)",
                        borderRadius: 8,
                        color: s.purple,
                        fontFamily: s.mono,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      ↑ Upload
                      <input
                        type="file"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const form = new FormData();
                          form.append("file", file);
                          form.append("path", filePath);
                          const res = await authFetch("/api/files", {
                            method: "POST",
                            body: form,
                          });
                          if (res?.ok) fetchFiles(filePath);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      onClick={() => downloadZip(filePath)}
                      style={{
                        padding: "6px 12px",
                        background: "transparent",
                        border: `0.5px solid ${s.border}`,
                        borderRadius: 8,
                        color: s.muted,
                        fontFamily: s.mono,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      ↓ zip
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, overflow: "auto" }}>
                  {loading ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 0",
                        color: s.muted,
                        fontSize: 13,
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
                          gap: 10,
                          padding: "10px 6px",
                          borderBottom: `0.5px solid ${s.border}`,
                          fontSize: 13,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(128,96,208,0.07)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <span
                          style={{
                            color:
                              f.type === "dir"
                                ? s.amber
                                : "rgba(255,255,255,0.25)",
                            width: 14,
                            flexShrink: 0,
                            fontSize: 12,
                          }}
                        >
                          {f.type === "dir" ? "▸" : "·"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            color:
                              f.type === "dir"
                                ? s.text
                                : "rgba(255,255,255,0.55)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
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
                          style={{
                            fontSize: 11,
                            color: s.muted,
                            flexShrink: 0,
                          }}
                        >
                          {f.modified}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: s.muted,
                            width: 54,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {f.type === "file" ? fmt(f.size) : ""}
                        </span>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          {f.viewable && (
                            <button
                              onClick={() =>
                                viewFile(`${filePath}/${f.name}`, f.name)
                              }
                              style={{
                                padding: "3px 9px",
                                background: "transparent",
                                border: "0.5px solid rgba(56,189,248,0.25)",
                                borderRadius: 5,
                                color: s.cyan,
                                fontFamily: s.mono,
                                fontSize: 10,
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
                                padding: "3px 9px",
                                background: "transparent",
                                border: "0.5px solid rgba(148,120,255,0.22)",
                                borderRadius: 5,
                                color: s.purple,
                                fontFamily: s.mono,
                                fontSize: 10,
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
                                padding: "3px 9px",
                                background: "transparent",
                                border: "0.5px solid rgba(148,120,255,0.22)",
                                borderRadius: 5,
                                color: s.purple,
                                fontFamily: s.mono,
                                fontSize: 10,
                                cursor: "pointer",
                              }}
                            >
                              zip
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete "${f.name}"?`)) return;
                              const res = await authFetch(
                                `/api/files?path=${encodeURIComponent(`${filePath}/${f.name}`)}&type=${f.type}`,
                                { method: "DELETE" },
                              );
                              if (res?.ok) {
                                if (fileContent?.name === f.name)
                                  setFileContent(null);
                                fetchFiles(filePath);
                              }
                            }}
                            style={{
                              padding: "3px 9px",
                              background: "transparent",
                              border: "0.5px solid rgba(248,113,113,0.2)",
                              borderRadius: 5,
                              color: s.red,
                              fontFamily: s.mono,
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {fileContent && (
                <FileEditor
                  key={fileContent.name}
                  fileContent={fileContent}
                  filePath={filePath}
                  authFetch={authFetch}
                  onClose={() => setFileContent(null)}
                  downloadFile={downloadFile}
                  s={s}
                />
              )}
            </div>
          )}

          {/* ── CV EDITOR ── */}
          {tab === "cv" && <CvEditor authFetch={authFetch} s={s} />}

          {/* ── SETTINGS ── */}
          {tab === "settings" && <SettingsTab authFetch={authFetch} s={s} />}
        </div>
      </main>
    </div>
  );
}
