"use client";
import { useRef, useEffect, useState } from "react";
import { StatusDot, fmt, fmtUptime, S, PM2Process } from "../shared";

interface Props {
  pm2List: PM2Process[];
  fetchPm2: () => void;
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}

export default function Pm2Tab({ pm2List, fetchPm2, authFetch, s }: Props) {
  const [pm2Logs, setPm2Logs] = useState<{
    name: string;
    lines: string[];
  } | null>(null);
  const logsRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const el = document.getElementById("pm2-log-body");
    if (el) el.scrollTop = el.scrollHeight;
  }, [pm2Logs?.lines.length]);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  return (
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
          flex: 1,
          overflow: "auto",
          minHeight: pm2Logs ? 200 : undefined,
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
            style={{ fontSize: 11, color: s.muted, letterSpacing: "0.13em" }}
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
                <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>
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
                  MEM: <span style={{ color: s.text }}>{fmt(p.memory)}</span>
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
                  <span style={{ color: s.text }}>{fmtUptime(p.uptime)}</span>
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
                      onClick={() => {
                        if (
                          action === "delete" &&
                          !window.confirm(
                            `Delete "${p.name}" from PM2?\n\nThe server will NOT auto-restart it.`,
                          )
                        )
                          return;
                        authFetch("/api/pm2", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: p.id, action }),
                        }).then(() => setTimeout(fetchPm2, 1000));
                      }}
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

      {/* Logs panel */}
      {pm2Logs && (
        <div
          style={{
            ...card(),
            height: "40%",
            minHeight: 240,
            maxHeight: 420,
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
              style={{ fontSize: 12, color: s.muted, letterSpacing: "0.12em" }}
            >
              LOGS — <span style={{ color: s.cyan }}>{pm2Logs.name}</span>
              <span style={{ color: s.muted, marginLeft: 10, fontSize: 11 }}>
                ({pm2Logs.lines.length} lines, capped at 300)
              </span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  const el = document.getElementById("pm2-log-body");
                  if (el) el.scrollTop = el.scrollHeight;
                }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 6,
                  color: s.muted,
                  fontFamily: s.mono,
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                ↓ Bottom
              </button>
              <button
                onClick={() => {
                  logsRef.current?.close();
                  setPm2Logs(null);
                }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 6,
                  color: s.muted,
                  fontFamily: s.mono,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div
            id="pm2-log-body"
            style={{
              flex: 1,
              overflow: "auto",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 9,
              padding: "10px 14px",
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
                    lineHeight: 1.65,
                    fontFamily: s.mono,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    color:
                      line.toLowerCase().includes("error") ||
                      line.toLowerCase().includes("err")
                        ? s.red
                        : line.toLowerCase().includes("warn")
                          ? s.amber
                          : "rgba(255,255,255,0.6)",
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
  );
}
