"use client";
import { StatusDot, S, Container } from "../shared";

interface Props {
  containers: Container[];
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  fetchContainers: () => void;
  s: S;
}

export default function DockerTab({
  containers,
  authFetch,
  fetchContainers,
  s,
}: Props) {
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  return (
    <div style={card()}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 11, color: s.muted, letterSpacing: "0.13em" }}>
          CONTAINERS ({containers.length})
        </span>
        <button
          onClick={fetchContainers}
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
                  onClick={() =>
                    authFetch("/api/docker", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: c.Id, action }),
                    }).then(() => fetchContainers())
                  }
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
  );
}
