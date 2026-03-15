"use client";
import { useState, useEffect } from "react";
import { S } from "./shared";

export default function RedisWarningBanner({
  authFetch,
  s,
}: {
  authFetch: (url: string) => Promise<Response | null>;
  s: S;
}) {
  const [status, setStatus] = useState<
    "loading" | "ok" | "not_running" | "not_installed"
  >("loading");
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const res = await authFetch("/api/settings");
    if (res?.ok) {
      const data = await res.json();
      const redis = data.health?.redis;
      if (!redis || redis.ok) {
        setStatus("ok");
      } else {
        setStatus(
          redis.status === "not_installed" ? "not_installed" : "not_running",
        );
        setReason(redis.reason ?? "");
      }
    }
    setChecking(false);
  };

  useEffect(() => {
    check();
  }, []);

  if (status === "loading" || status === "ok") return null;

  return (
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
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>⚠</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: s.red }}>
          Redis not available — Electron login disabled
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={check}
          disabled={checking}
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
          {checking ? "Checking..." : "↻ Re-check"}
        </button>
      </div>
      <div
        style={{
          background: "rgba(0,0,0,0.3)",
          borderRadius: 8,
          padding: "10px 14px",
          fontFamily: s.mono,
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          lineHeight: 2,
        }}
      >
        {status === "not_installed" ? (
          <>
            <span style={{ color: s.muted }}># Install and start Redis</span>
            <br />
            apt install -y redis-server
            <br />
            systemctl enable redis-server
            <br />
            systemctl start redis-server
          </>
        ) : (
          <>
            <span style={{ color: s.muted }}># Start Redis</span>
            <br />
            systemctl start redis-server
            <br />
            <span style={{ color: s.muted }}># Verify</span>
            <br />
            redis-cli ping
            <span style={{ color: s.green, marginLeft: 12 }}># → PONG</span>
          </>
        )}
      </div>
      {reason && (
        <div
          style={{ marginTop: 8, fontSize: 10, color: "rgba(248,113,113,0.5)" }}
        >
          {reason}
        </div>
      )}
    </div>
  );
}
