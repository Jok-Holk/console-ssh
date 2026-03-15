"use client";
import { useState } from "react";

// ─── Module definitions ───────────────────────────────────────────────────────
const MODULES = [
  {
    id: "core",
    label: "Core",
    icon: "⬡",
    required: true,
    desc: "Authentication, Redis, JWT. Required for all other modules.",
    fields: [
      {
        key: "REDIS_URL",
        label: "Redis URL",
        placeholder: "redis://localhost:6380",
        type: "text",
      },
      {
        key: "VPS_HOST",
        label: "VPS Host (SSH)",
        placeholder: "your-server-ip",
        type: "text",
      },
      { key: "VPS_USER", label: "VPS User", placeholder: "root", type: "text" },
      {
        key: "NEXT_PUBLIC_VPS_HOST",
        label: "Public VPS Host",
        placeholder: "your-server-ip",
        type: "text",
      },
      {
        key: "NEXT_PUBLIC_VPS_USER",
        label: "Public VPS User",
        placeholder: "root",
        type: "text",
      },
      {
        key: "APP_DIR",
        label: "App Directory",
        placeholder: "/home/user/vps-manager",
        type: "text",
      },
      {
        key: "PM2_APP_NAME",
        label: "PM2 Process Name",
        placeholder: "vps-manager",
        type: "text",
      },
      {
        key: "GIT_REMOTE",
        label: "Git Remote",
        placeholder: "origin",
        type: "text",
      },
      {
        key: "GIT_BRANCH",
        label: "Git Branch",
        placeholder: "main",
        type: "text",
      },
    ],
  },
  {
    id: "ssh",
    label: "Terminal",
    icon: ">_",
    required: false,
    desc: "SSH console access. Requires private key file on server.",
    fields: [
      {
        key: "VPS_PRIVATE_KEY_PATH",
        label: "Private Key Path",
        placeholder: "./keys/id_rsa",
        type: "text",
      },
    ],
  },
  {
    id: "metrics",
    label: "Monitor",
    icon: "◈",
    required: false,
    desc: "Realtime CPU, RAM, Disk, Network metrics. Reads /proc directly.",
    fields: [],
    envKey: "ENABLE_METRICS",
  },
  {
    id: "docker",
    label: "Docker",
    icon: "▣",
    required: false,
    desc: "Container management. Requires Docker installed on VPS.",
    fields: [],
    envKey: "ENABLE_DOCKER",
  },
  {
    id: "pm2",
    label: "PM2",
    icon: "⟳",
    required: false,
    desc: "Process manager. Requires PM2 installed globally.",
    fields: [],
    envKey: "ENABLE_PM2",
  },
  {
    id: "files",
    label: "Files",
    icon: "⊟",
    required: false,
    desc: "SFTP file browser, editor, upload/download.",
    fields: [],
    envKey: "ENABLE_FILES",
  },
  {
    id: "cv",
    label: "CV Editor",
    icon: "✎",
    required: false,
    desc: "Markdown CV editor with PDF export. Requires cv-service running.",
    fields: [
      {
        key: "CV_SERVICE_URL",
        label: "CV Service URL",
        placeholder: "http://localhost:4321",
        type: "text",
      },
    ],
    envKey: "NEXT_PUBLIC_ENABLE_CV",
  },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

// ─── Setup Page ───────────────────────────────────────────────────────────────
export default function SetupPage() {
  const [step, setStep] = useState(0); // 0=welcome, 1=modules, 2=config, 3=done
  const [enabled, setEnabled] = useState<Set<ModuleId>>(
    new Set(["core", "ssh", "metrics", "pm2", "files"] as ModuleId[]),
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = {
    bg: "#080810",
    surface: "#0f0f1e",
    border: "rgba(255,255,255,0.08)",
    purple: "#c4adff",
    cyan: "#38bdf8",
    green: "#4ade80",
    red: "#f87171",
    amber: "#f59e0b",
    text: "#ddd8f8",
    muted: "rgba(255,255,255,0.35)",
    mono: "'Space Mono','Courier New',monospace",
  };

  const toggle = (id: ModuleId) => {
    if (id === "core") return; // core always enabled
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Build env updates from form values + module toggles
    const updates: Record<string, string> = { ...values };

    for (const mod of MODULES) {
      if ("envKey" in mod && mod.envKey) {
        updates[mod.envKey] = enabled.has(mod.id) ? "true" : "false";
      }
    }

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          restart: [updates["PM2_APP_NAME"] ?? "app"],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep(3);
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  const input = (key: string, placeholder: string, type = "text") => (
    <input
      type={type}
      value={values[key] ?? ""}
      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "#080810",
        border: `0.5px solid ${s.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        color: s.text,
        fontFamily: s.mono,
        fontSize: 12,
        outline: "none",
        boxSizing: "border-box" as const,
      }}
    />
  );

  const card: React.CSSProperties = {
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "20px 24px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: s.bg,
        color: s.text,
        fontFamily: s.mono,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Progress */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 32,
            alignItems: "center",
          }}
        >
          {["Welcome", "Modules", "Configure", "Done"].map((label, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background:
                    i <= step
                      ? "rgba(148,120,255,0.25)"
                      : "rgba(255,255,255,0.05)",
                  border: `0.5px solid ${i <= step ? "rgba(148,120,255,0.5)" : s.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: i <= step ? s.purple : s.muted,
                }}
              >
                {i + 1}
              </div>
              <span
                style={{ fontSize: 11, color: i === step ? s.text : s.muted }}
              >
                {label}
              </span>
              {i < 3 && (
                <span style={{ color: s.border, margin: "0 4px" }}>—</span>
              )}
            </div>
          ))}
        </div>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⬡</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 500,
                  color: "#ede8ff",
                  marginBottom: 8,
                }}
              >
                VPS Manager
              </div>
              <div style={{ fontSize: 12, color: s.muted, lineHeight: 1.7 }}>
                First-run setup. Configure modules and connection details.
                <br />
                You can change these later in the Settings tab.
              </div>
            </div>
            <button
              onClick={() => setStep(1)}
              style={{
                width: "100%",
                padding: 12,
                background: "rgba(128,96,208,0.2)",
                border: "0.5px solid rgba(148,120,255,0.4)",
                borderRadius: 10,
                color: s.purple,
                fontFamily: s.mono,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Get Started →
            </button>
          </div>
        )}

        {/* ── Step 1: Module selection ── */}
        {step === 1 && (
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#ede8ff",
                marginBottom: 6,
              }}
            >
              Select Modules
            </div>
            <div
              style={{
                fontSize: 12,
                color: s.muted,
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              Choose which features to enable. Disabled modules won't appear in
              the sidebar.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 24,
              }}
            >
              {MODULES.map((mod) => {
                const on = enabled.has(mod.id);
                return (
                  <div
                    key={mod.id}
                    onClick={() => toggle(mod.id)}
                    style={{
                      ...card,
                      padding: "14px 18px",
                      cursor: mod.required ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      borderColor: on ? "rgba(148,120,255,0.3)" : s.border,
                      background: on ? "rgba(128,96,208,0.08)" : s.surface,
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{ fontSize: 18, width: 24, textAlign: "center" }}
                    >
                      {mod.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: s.text,
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {mod.label}
                        {mod.required && (
                          <span
                            style={{
                              fontSize: 9,
                              color: s.amber,
                              border: "0.5px solid rgba(245,158,11,0.3)",
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            required
                          </span>
                        )}
                      </div>
                      <div
                        style={{ fontSize: 11, color: s.muted, marginTop: 3 }}
                      >
                        {mod.desc}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: on
                          ? "rgba(148,120,255,0.4)"
                          : "rgba(255,255,255,0.08)",
                        border: `0.5px solid ${on ? "rgba(148,120,255,0.5)" : s.border}`,
                        position: "relative",
                        flexShrink: 0,
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: on ? s.purple : s.muted,
                          position: "absolute",
                          top: 2,
                          left: on ? 18 : 2,
                          transition: "left 0.2s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(0)}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 9,
                  color: s.muted,
                  fontFamily: s.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(2)}
                style={{
                  flex: 1,
                  padding: 10,
                  background: "rgba(128,96,208,0.2)",
                  border: "0.5px solid rgba(148,120,255,0.4)",
                  borderRadius: 9,
                  color: s.purple,
                  fontFamily: s.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Configure →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure fields ── */}
        {step === 2 && (
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#ede8ff",
                marginBottom: 6,
              }}
            >
              Configure
            </div>
            <div style={{ fontSize: 12, color: s.muted, marginBottom: 20 }}>
              Fill in connection details. Leave blank to skip.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {MODULES.filter(
                (m) => enabled.has(m.id) && m.fields.length > 0,
              ).map((mod) => (
                <div key={mod.id} style={card}>
                  <div
                    style={{
                      fontSize: 11,
                      color: s.muted,
                      letterSpacing: "0.1em",
                      marginBottom: 14,
                    }}
                  >
                    {mod.icon} {mod.label.toUpperCase()}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {mod.fields.map((field) => (
                      <div key={field.key}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 10,
                            color: s.muted,
                            letterSpacing: "0.1em",
                            marginBottom: 6,
                          }}
                        >
                          {field.label}
                        </label>
                        {input(field.key, field.placeholder, field.type)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <div
                style={{
                  fontSize: 12,
                  color: s.red,
                  background: "rgba(248,113,113,0.08)",
                  border: "0.5px solid rgba(248,113,113,0.2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 9,
                  color: s.muted,
                  fontFamily: s.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: 10,
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
                {saving ? "Saving..." : "Save & Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: s.green,
                marginBottom: 8,
              }}
            >
              Setup Complete
            </div>
            <div
              style={{
                fontSize: 12,
                color: s.muted,
                marginBottom: 28,
                lineHeight: 1.7,
              }}
            >
              Configuration saved. The server is restarting with the new
              settings.
              <br />
              You'll be redirected to login in a moment.
            </div>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                width: "100%",
                padding: 12,
                background: "rgba(74,222,128,0.15)",
                border: "0.5px solid rgba(74,222,128,0.3)",
                borderRadius: 10,
                color: s.green,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Go to Login →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
