"use client";
import { useState, useEffect } from "react";
import { S } from "./shared";

// ─── Module config definitions ───────────────────────────────────────────────
const MODULE_DEFS = [
  {
    id: "metrics",
    label: "Monitor",
    icon: "◈",
    envKey: "NEXT_PUBLIC_ENABLE_METRICS",
    fields: [] as Field[],
  },
  {
    id: "docker",
    label: "Docker",
    icon: "▣",
    envKey: "NEXT_PUBLIC_ENABLE_DOCKER",
    fields: [] as Field[],
  },
  {
    id: "pm2",
    label: "PM2",
    icon: "⟳",
    envKey: "NEXT_PUBLIC_ENABLE_PM2",
    fields: [] as Field[],
  },
  {
    id: "files",
    label: "Files",
    icon: "⊟",
    envKey: "NEXT_PUBLIC_ENABLE_FILES",
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
  status?: string;
  reason?: string;
}

export default function SettingsTab({
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
    { key: "VPS_HOST", label: "VPS Host", placeholder: "your-server-ip" },
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
      placeholder: "your-server-ip",
    },
    {
      key: "NEXT_PUBLIC_VPS_USER",
      label: "Public VPS User",
      placeholder: "root",
    },
    {
      key: "PUBLIC_KEY_ED25519",
      label: "Ed25519 Public Key",
      placeholder: "-----BEGIN PUBLIC KEY-----...",
    },
  ];

  // Deploy config fields
  const DEPLOY_FIELDS = [
    {
      key: "APP_DIR",
      label: "App Directory",
      placeholder: "/home/user/vps-manager",
    },
    {
      key: "PM2_APP_NAME",
      label: "PM2 Process Name",
      placeholder: "vps-manager",
    },
    { key: "GIT_REMOTE", label: "Git Remote", placeholder: "origin" },
    { key: "GIT_BRANCH", label: "Git Branch", placeholder: "main" },
  ];

  const [sshTestResult, setSshTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [sshTesting, setSshTesting] = useState(false);

  const testSSH = async () => {
    setSshTesting(true);
    setSshTestResult(null);
    const res = await authFetch("/api/settings/check-ssh");
    if (res?.ok) {
      const data = await res.json();
      setSshTestResult({ ok: data.ok, message: data.message });
    } else {
      setSshTestResult({ ok: false, message: "Request failed" });
    }
    setSshTesting(false);
  };

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

    // Warn if PUBLIC_KEY_ED25519 is being changed — could lock user out
    if (updates["PUBLIC_KEY_ED25519"] !== undefined) {
      const newKey = updates["PUBLIC_KEY_ED25519"];
      if (newKey && !newKey.includes("BEGIN PUBLIC KEY")) {
        setSaving(false);
        setSaveMsg(
          "Invalid key format — must be a PEM public key (-----BEGIN PUBLIC KEY-----)",
        );
        return;
      }
      if (
        envData?.["PUBLIC_KEY_ED25519"] &&
        newKey !== envData["PUBLIC_KEY_ED25519"]
      ) {
        const confirmed = window.confirm(
          "⚠ You are changing the Ed25519 public key.\n\n" +
            "If the new key does not match your Electron app, you will be locked out.\n\n" +
            "Make sure your Electron app is open and ready before confirming.\n\n" +
            "Continue?",
        );
        if (!confirmed) {
          setSaving(false);
          return;
        }
      }
    }

    const res = await authFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates,
        restart: [edits["PM2_APP_NAME"] ?? envData?.["PM2_APP_NAME"] ?? "app"],
        rebuild: true,
      }),
    });

    setSaving(false);
    if (res?.ok) {
      const data = await res.json();
      if (data.rebuilding) {
        setSaveMsg("Saved ✓ — building (~30–60s), will auto-reload...");
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const r = await fetch("/api/auth/token", { cache: "no-store" });
            if (r.ok || r.status === 401) {
              clearInterval(poll);
              // Check if build actually succeeded
              try {
                const statusRes = await fetch("/api/settings/rebuild-status", {
                  cache: "no-store",
                });
                if (statusRes.ok) {
                  const { status, log } = await statusRes.json();
                  if (status === "failed") {
                    setSaveMsg(
                      `⚠ Build failed — check server logs.\n\nLast output:\n${log?.split("\n").slice(-8).join("\n")}`,
                    );
                    return;
                  }
                }
              } catch {}
              window.location.href = "/dashboard";
            }
          } catch {}
          if (attempts > 90) {
            clearInterval(poll);
            setSaveMsg("⚠ Server taking too long. Check: pm2 logs vps-manager");
          }
        }, 2000);
      } else {
        setSaveMsg("Saved ✓ — restarting...");
        setTimeout(() => (window.location.href = "/dashboard"), 4000);
      }
    } else {
      setSaveMsg("Save failed");
    }
  };

  const [rechecking, setRechecking] = useState(false);

  const recheck = async () => {
    setRechecking(true);
    const res = await authFetch("/api/settings");
    if (res?.ok) {
      const data = await res.json();
      setHealth(data.health);
    }
    setRechecking(false);
  };

  const healthBadge = (key: string) => {
    if (!health) return null;
    const h = health[key] as
      | { ok: boolean; status?: string; reason?: string }
      | undefined;
    if (!h) return null;

    const statusConfig: Record<
      string,
      { color: string; label: string; glow?: boolean }
    > = {
      ok: { color: "#4ade80", label: "OK", glow: true },
      empty: { color: "#f59e0b", label: "Empty" },
      not_running: { color: "#f87171", label: "Not running" },
      not_installed: { color: "#6b7280", label: "Not installed" },
      misconfigured: { color: "#f87171", label: "Misconfigured" },
    };

    const hints: Record<string, Record<string, string>> = {
      redis: {
        not_running: "Run: systemctl start redis-server",
        not_installed:
          "Run: apt install -y redis-server && systemctl enable redis-server",
        misconfigured: "Check REDIS_URL in settings below",
      },
      ssh: {
        misconfigured:
          'Set VPS_PRIVATE_KEY_PATH and run: ssh-keygen -t ed25519 -f ./keys/id_rsa -N "" && cat ./keys/id_rsa.pub >> ~/.ssh/authorized_keys',
        not_running: "Run: systemctl start ssh",
        not_installed:
          "Run: apt install -y openssh-server && systemctl enable ssh",
      },
      docker: {
        not_installed: "Run: curl -fsSL https://get.docker.com | sh",
        not_running: "Run: systemctl start docker",
      },
      pm2: {
        not_installed: "Run: npm install -g pm2",
        not_running: "Run: pm2 resurrect",
      },
      cv: {
        not_running:
          "Start cv-service: pm2 start ecosystem.config.js --only cv-service",
        misconfigured: "Set CV_SERVICE_URL in Modules section below",
      },
    };

    const st = (h.status ?? (h.ok ? "ok" : "not_running")) as string;
    const cfg = statusConfig[st] ?? statusConfig["not_running"];
    const hint = hints[key]?.[st];

    return (
      <span
        style={{
          marginLeft: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          verticalAlign: "middle",
        }}
      >
        <span
          title={h.reason ?? cfg.label}
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: cfg.color,
            boxShadow: cfg.glow ? `0 0 5px ${cfg.color}88` : "none",
          }}
        />
        <span
          style={{ fontSize: 9, color: cfg.color, letterSpacing: "0.05em" }}
        >
          {cfg.label}
        </span>
        {h.reason && st !== "ok" && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
            — {h.reason}
          </span>
        )}
        {hint && (
          <span
            title={hint}
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.2)",
              cursor: "help",
              textDecoration: "underline dotted",
            }}
          >
            ?
          </span>
        )}
      </span>
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
      {/* Redis critical warning — shown when Redis is not OK */}
      {health && health.redis && !health.redis.ok && (
        <div
          style={{
            background: "rgba(248,113,113,0.07)",
            border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: s.red }}>
              Redis is required but not available
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={recheck}
              disabled={rechecking}
              style={{
                padding: "5px 14px",
                background: "rgba(248,113,113,0.1)",
                border: "0.5px solid rgba(248,113,113,0.4)",
                borderRadius: 7,
                color: s.red,
                fontFamily: s.mono,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {rechecking ? "Checking..." : "↻ Re-check"}
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.8,
              marginBottom: 10,
            }}
          >
            Redis is used to securely exchange one-time credentials between the
            desktop app and this server. Without it, Electron-based login will
            not work.
          </div>
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              fontFamily: s.mono,
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.9,
            }}
          >
            {(health.redis as HealthResult).status === "not_installed" ? (
              <>
                <div style={{ color: s.muted, marginBottom: 4 }}>
                  # Install Redis
                </div>
                <div>apt install -y redis-server</div>
                <div>systemctl enable redis-server</div>
                <div>systemctl start redis-server</div>
              </>
            ) : (
              <>
                <div style={{ color: s.muted, marginBottom: 4 }}>
                  # Start Redis
                </div>
                <div>systemctl start redis-server</div>
                <div style={{ color: s.muted, marginTop: 6, marginBottom: 4 }}>
                  # Then verify
                </div>
                <div>
                  redis-cli ping
                  <span style={{ color: s.green, marginLeft: 12 }}>
                    # should return PONG
                  </span>
                </div>
              </>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: s.muted }}>
            After starting Redis, click{" "}
            <strong style={{ color: "rgba(255,255,255,0.4)" }}>
              ↻ Re-check
            </strong>{" "}
            above to verify.
            {health.redis.reason && (
              <span style={{ marginLeft: 8, color: "rgba(248,113,113,0.6)" }}>
                ({health.redis.reason})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Core connection */}
      <div style={card()}>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            letterSpacing: "0.13em",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>CORE CONNECTION</span>
          {healthBadge("redis")}
          {healthBadge("ssh")}
          <div style={{ flex: 1 }} />
          <button
            onClick={recheck}
            disabled={rechecking}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: `0.5px solid ${s.border}`,
              borderRadius: 7,
              color: s.muted,
              fontFamily: s.mono,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {rechecking ? "..." : "↻"}
          </button>
          <button
            onClick={testSSH}
            disabled={sshTesting}
            style={{
              padding: "4px 12px",
              background: "transparent",
              border: `0.5px solid ${s.border}`,
              borderRadius: 7,
              color: s.muted,
              fontFamily: s.mono,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {sshTesting ? "Testing..." : "Test SSH"}
          </button>
        </div>
        {sshTestResult && (
          <div
            style={{
              fontSize: 11,
              color: sshTestResult.ok ? s.green : s.red,
              background: sshTestResult.ok
                ? "rgba(74,222,128,0.06)"
                : "rgba(248,113,113,0.06)",
              border: `0.5px solid ${sshTestResult.ok ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 14,
            }}
          >
            {sshTestResult.ok ? "✓" : "✗"} {sshTestResult.message}
          </div>
        )}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {CORE_FIELDS.filter((f) => f.key !== "PUBLIC_KEY_ED25519").map(
            (f) => (
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
            ),
          )}
        </div>

        {/* PUBLIC_KEY_ED25519 — full width textarea with hint */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <label
              style={{ fontSize: 10, color: s.muted, letterSpacing: "0.1em" }}
            >
              ED25519 PUBLIC KEY
            </label>
            {!(
              edits["PUBLIC_KEY_ED25519"] ?? envData?.["PUBLIC_KEY_ED25519"]
            ) && (
              <span style={{ fontSize: 10, color: s.amber }}>
                ⚠ Required for Electron login — or generate a key pair manually
              </span>
            )}
            {(edits["PUBLIC_KEY_ED25519"] ??
              envData?.["PUBLIC_KEY_ED25519"]) && (
              <span style={{ fontSize: 10, color: s.green }}>
                ✓ Key configured
              </span>
            )}
          </div>
          <textarea
            value={edits["PUBLIC_KEY_ED25519"] ?? ""}
            onChange={(e) =>
              setEdits((prev) => ({
                ...prev,
                PUBLIC_KEY_ED25519: e.target.value,
              }))
            }
            placeholder={
              "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n\nGenerate with: ssh-keygen -t ed25519 -f mykey\nthen: ssh-keygen -e -f mykey.pub -m pkcs8\nOr copy from the VPS Key Manager desktop app."
            }
            rows={5}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
          <div
            style={{
              fontSize: 10,
              color: s.muted,
              marginTop: 6,
              lineHeight: 1.6,
            }}
          >
            No desktop app? Run on your local machine:{" "}
            <code
              style={{
                background: "rgba(255,255,255,0.05)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              ssh-keygen -t ed25519 -f vpskey && ssh-keygen -e -f vpskey.pub -m
              pkcs8
            </code>{" "}
            → paste the output above.
          </div>
        </div>
      </div>

      {/* Deploy config */}
      <div style={card()}>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            letterSpacing: "0.13em",
            marginBottom: 16,
          }}
        >
          DEPLOY CONFIG
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {DEPLOY_FIELDS.map((f) => (
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
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>MODULES</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={recheck}
            disabled={rechecking}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: `0.5px solid ${s.border}`,
              borderRadius: 7,
              color: s.muted,
              fontFamily: s.mono,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {rechecking ? "..." : "↻ Re-check"}
          </button>
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
                    {on && hkey && healthBadge(hkey)}
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

      {/* Quick Access config */}
      <div style={card()}>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            letterSpacing: "0.13em",
            marginBottom: 16,
          }}
        >
          QUICK ACCESS SHORTCUTS
        </div>
        <div
          style={{
            fontSize: 11,
            color: s.muted,
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          Toggle shortcuts on the Dashboard home. Grid columns (2–4) controls
          how many per row.
        </div>
        {/* Grid column picker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 11, color: s.muted }}>Columns:</span>
          {[2, 3, 4].map((n) => {
            const key = "NEXT_PUBLIC_QA_COLS";
            const current = parseInt(edits[key] ?? envData?.[key] ?? "3");
            return (
              <button
                key={n}
                onClick={() =>
                  setEdits((prev) => ({ ...prev, [key]: String(n) }))
                }
                style={{
                  width: 32,
                  height: 28,
                  background:
                    current === n ? "rgba(148,120,255,0.25)" : "transparent",
                  border: `0.5px solid ${current === n ? "rgba(148,120,255,0.5)" : s.border}`,
                  borderRadius: 7,
                  color: current === n ? s.purple : s.muted,
                  fontFamily: s.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {[
            {
              envKey: "NEXT_PUBLIC_QA_TERMINAL",
              label: ">_ Terminal",
              defaultOn: true,
            },
            {
              envKey: "NEXT_PUBLIC_QA_MONITOR",
              label: "◈ Monitor",
              defaultOn: true,
            },
            {
              envKey: "NEXT_PUBLIC_QA_DOCKER",
              label: "▣ Docker",
              defaultOn: true,
            },
            { envKey: "NEXT_PUBLIC_QA_PM2", label: "⟳ PM2", defaultOn: true },
            {
              envKey: "NEXT_PUBLIC_QA_FILES",
              label: "⊟ Files",
              defaultOn: true,
            },
            {
              envKey: "NEXT_PUBLIC_QA_CV",
              label: "✎ CV Editor",
              defaultOn: false,
            },
          ].map(({ envKey, label, defaultOn }) => {
            const val = edits[envKey] ?? envData?.[envKey];
            const on = val !== undefined ? val !== "false" : defaultOn;
            return (
              <div
                key={envKey}
                onClick={() =>
                  setEdits((prev) => ({
                    ...prev,
                    [envKey]: on ? "false" : "true",
                  }))
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: on
                    ? "rgba(128,96,208,0.06)"
                    : "rgba(255,255,255,0.02)",
                  border: `0.5px solid ${on ? "rgba(148,120,255,0.2)" : s.border}`,
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: on ? s.text : s.muted,
                  }}
                >
                  {label}
                </span>
                <div
                  style={{
                    width: 32,
                    height: 18,
                    borderRadius: 9,
                    background: on
                      ? "rgba(148,120,255,0.4)"
                      : "rgba(255,255,255,0.08)",
                    border: `0.5px solid ${on ? "rgba(148,120,255,0.5)" : s.border}`,
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: on ? s.purple : s.muted,
                      position: "absolute",
                      top: 2,
                      left: on ? 16 : 2,
                      transition: "left 0.15s",
                    }}
                  />
                </div>
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
        trigger a rebuild + PM2 reload. Dashboard will reload automatically when
        ready (~30s).
      </div>
    </div>
  );
}
