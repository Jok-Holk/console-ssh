"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Space Mono', 'Courier New', monospace",
        padding: "20px",
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
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.1em",
            }}
          >
            {process.env.NEXT_PUBLIC_VPS_USER}@
            {process.env.NEXT_PUBLIC_VPS_HOST}
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#0f0f1e",
            border: "0.5px solid rgba(255,255,255,0.09)",
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
              color: "rgba(255,255,255,0.3)",
              marginBottom: 28,
              lineHeight: 1.6,
            }}
          >
            Generate credentials from the desktop app.
          </div>

          <form action={action}>
            {/* KEY */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
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
                style={{
                  width: "100%",
                  background: "#080810",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 9,
                  padding: "11px 14px",
                  color: "#ddd8f8",
                  fontFamily: "inherit",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* PASS */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
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
                style={{
                  width: "100%",
                  background: "#080810",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 9,
                  padding: "11px 14px",
                  color: "#ddd8f8",
                  fontFamily: "inherit",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* Error */}
            {state?.error && (
              <div
                style={{
                  fontSize: 11,
                  color: "#f87171",
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

            {/* Hint */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                padding: "12px",
                background: pending
                  ? "rgba(128,96,208,0.1)"
                  : "rgba(128,96,208,0.2)",
                border: "0.5px solid rgba(148,120,255,0.4)",
                borderRadius: 10,
                color: pending ? "rgba(196,173,255,0.5)" : "#c4adff",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                cursor: pending ? "wait" : "pointer",
                letterSpacing: "0.06em",
                transition: "all 0.15s",
              }}
            >
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        {/* Footer */}
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
              background: "#4ade80",
              display: "inline-block",
              boxShadow: "0 0 4px rgba(74,222,128,0.7)",
            }}
          />
          Ed25519 challenge-response
        </div>
      </div>
    </div>
  );
}
