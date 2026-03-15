"use client";
import { useActionState, useEffect, useState } from "react";
import { loginAction } from "./actions";

const s = {
  bg: "#080810",
  surface: "#0f0f1e",
  border: "rgba(255,255,255,0.09)",
  purple: "#c4adff",
  green: "#4ade80",
  red: "#f87171",
  amber: "#f59e0b",
  text: "#ddd8f8",
  muted: "rgba(255,255,255,0.32)",
  mono: "'Space Mono','Courier New',monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#080810",
  border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 9,
  padding: "11px 14px",
  color: s.text,
  fontFamily: s.mono,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);

  const [setupMode, setSetupMode] = useState<boolean | null>(null);
  const [setupPass, setSetupPass] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup-login")
      .then((r) => r.json())
      .then((d) => setSetupMode(d.setupMode ?? false))
      .catch(() => setSetupMode(false));
  }, []);

  const handleSetupLogin = async () => {
    if (!setupPass.trim()) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/auth/setup-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: setupPass }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setSetupError(data.error ?? "Invalid password");
      }
    } catch {
      setSetupError("Network error");
    }
    setSetupLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: s.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: s.mono,
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto 16px",
              background: "#131325",
              border: "0.5px solid rgba(148,120,255,0.3)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polygon
                points="12,2 21,7 21,17 12,22 3,17 3,7"
                stroke="#9478ff"
                strokeWidth="1.4"
                fill="none"
              />
              <circle cx="12" cy="12" r="3" fill="#9478ff" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "#ede8ff",
              marginBottom: 4,
            }}
          >
            VPS Manager
          </div>
          <div style={{ fontSize: 11, color: s.muted, letterSpacing: "0.1em" }}>
            {process.env.NEXT_PUBLIC_VPS_USER ?? "user"}@
            {process.env.NEXT_PUBLIC_VPS_HOST ?? "not configured"}
          </div>
        </div>

        {/* Loading */}
        {setupMode === null && (
          <div
            style={{
              textAlign: "center",
              color: s.muted,
              fontSize: 12,
              padding: "40px 0",
            }}
          >
            Checking configuration...
          </div>
        )}

        {/* Setup mode */}
        {setupMode === true && (
          <div
            style={{
              background: s.surface,
              border: "0.5px solid rgba(245,158,11,0.25)",
              borderRadius: 16,
              padding: "28px 28px",
            }}
          >
            <div
              style={{
                background: "rgba(245,158,11,0.07)",
                border: "0.5px solid rgba(245,158,11,0.2)",
                borderRadius: 9,
                padding: "12px 14px",
                marginBottom: 24,
                fontSize: 11,
                color: s.amber,
                lineHeight: 1.7,
              }}
            >
              <strong>First Run Setup</strong>
              <br />
              No authentication key configured yet.
              <br />
              Check your server logs for the setup password:
              <br />
              <br />
              <code
                style={{
                  fontSize: 11,
                  background: "rgba(0,0,0,0.3)",
                  padding: "4px 8px",
                  borderRadius: 4,
                }}
              >
                pm2 logs vps-manager --lines 50
              </code>
            </div>

            <div style={{ fontSize: 14, color: "#c8c0f0", marginBottom: 20 }}>
              Setup Login
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: s.muted,
                  letterSpacing: "0.14em",
                  marginBottom: 7,
                }}
              >
                SETUP PASSWORD
              </label>
              <input
                type="password"
                value={setupPass}
                onChange={(e) => setSetupPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetupLogin()}
                placeholder="From PM2 / server logs"
                style={inputStyle}
              />
            </div>

            {setupError && (
              <div
                style={{
                  fontSize: 11,
                  color: s.red,
                  background: "rgba(248,113,113,0.08)",
                  border: "0.5px solid rgba(248,113,113,0.2)",
                  borderRadius: 7,
                  padding: "9px 12px",
                  marginBottom: 16,
                }}
              >
                {setupError}
              </div>
            )}

            <button
              onClick={handleSetupLogin}
              disabled={setupLoading || !setupPass.trim()}
              style={{
                width: "100%",
                padding: 12,
                background: "rgba(245,158,11,0.15)",
                border: "0.5px solid rgba(245,158,11,0.4)",
                borderRadius: 10,
                color: s.amber,
                fontFamily: s.mono,
                fontSize: 13,
                fontWeight: 500,
                cursor: setupLoading ? "wait" : "pointer",
                opacity: !setupPass.trim() || setupLoading ? 0.5 : 1,
              }}
            >
              {setupLoading ? "Signing in..." : "Continue with Setup Password"}
            </button>

            <div
              style={{
                marginTop: 16,
                fontSize: 10,
                color: s.muted,
                lineHeight: 1.7,
                textAlign: "center",
              }}
            >
              After login →{" "}
              <strong style={{ color: "rgba(255,255,255,0.5)" }}>
                Settings
              </strong>{" "}
              → paste your Ed25519 public key.
              <br />
              Setup password will be disabled automatically.
            </div>
          </div>
        )}

        {/* Normal mode */}
        {setupMode === false && (
          <div
            style={{
              background: s.surface,
              border: `0.5px solid ${s.border}`,
              borderRadius: 16,
              padding: "32px 28px",
            }}
          >
            <div style={{ fontSize: 14, color: "#c8c0f0", marginBottom: 6 }}>
              Sign in
            </div>
            <div
              style={{
                fontSize: 11,
                color: s.muted,
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              Generate credentials from the desktop app.
            </div>

            <form action={action}>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 7,
                  }}
                >
                  KEY
                </label>
                <input
                  name="key"
                  type="text"
                  autoComplete="off"
                  placeholder="Paste one-time key"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: s.muted,
                    letterSpacing: "0.14em",
                    marginBottom: 7,
                  }}
                >
                  PASS
                </label>
                <input
                  name="pass"
                  type="password"
                  placeholder="••••••••••"
                  style={inputStyle}
                />
              </div>

              {state?.error && (
                <div
                  style={{
                    fontSize: 11,
                    color: s.red,
                    background: "rgba(248,113,113,0.08)",
                    border: "0.5px solid rgba(248,113,113,0.2)",
                    borderRadius: 7,
                    padding: "9px 12px",
                    marginBottom: 16,
                  }}
                >
                  {state.error}
                </div>
              )}

              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.22)",
                  background: "rgba(255,255,255,0.03)",
                  borderLeft: "2px solid rgba(148,120,255,0.3)",
                  borderRadius: "0 6px 6px 0",
                  padding: "9px 12px",
                  marginBottom: 20,
                  lineHeight: 1.6,
                }}
              >
                Open desktop app → Generate → copy KEY and PASS here. Expires in
                10 minutes.
              </div>

              <button
                type="submit"
                disabled={pending}
                style={{
                  width: "100%",
                  padding: 12,
                  background: pending
                    ? "rgba(128,96,208,0.1)"
                    : "rgba(128,96,208,0.2)",
                  border: "0.5px solid rgba(148,120,255,0.4)",
                  borderRadius: 10,
                  color: pending ? "rgba(196,173,255,0.5)" : s.purple,
                  fontFamily: s.mono,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? "wait" : "pointer",
                  letterSpacing: "0.06em",
                }}
              >
                {pending ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        )}

        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 10,
            color: "rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: setupMode ? s.amber : s.green,
              display: "inline-block",
              boxShadow: `0 0 4px ${setupMode ? "rgba(245,158,11,0.7)" : "rgba(74,222,128,0.7)"}`,
            }}
          />
          {setupMode
            ? "Setup mode — configure auth key after login"
            : "Ed25519 challenge-response"}
        </div>
      </div>
    </div>
  );
}
