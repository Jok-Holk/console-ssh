"use client";
import {
  Bar,
  StatusDot,
  InfoRow,
  fmt,
  S,
  Metrics,
  PM2Process,
  TabId,
} from "../shared";
import RedisWarningBanner from "../RedisWarningBanner";

interface Props {
  metrics: Metrics | null;
  pm2List: PM2Process[];
  modules: Record<string, boolean>;
  qaCols: number;
  setQaCols: (n: number) => void;
  setTab: (t: TabId) => void;
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}

export default function HomeTab({
  metrics,
  pm2List,
  modules,
  qaCols,
  setQaCols,
  setTab,
  authFetch,
  s,
}: Props) {
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  const purple = "#8060d0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <RedisWarningBanner authFetch={authFetch} s={s} />

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}
      >
        {[
          {
            label: "CPU USAGE",
            value: metrics?.cpu ?? 0,
            color: purple,
            bar: purple,
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
              fontSize: 11,
              color: s.muted,
              letterSpacing: "0.13em",
              marginBottom: 12,
            }}
          >
            SYSTEM
          </div>
          {(
            [
              ["Uptime", metrics?.uptime ?? "—"],
              [
                "Load Avg",
                metrics
                  ? `${metrics.load["1m"]} · ${metrics.load["5m"]} · ${metrics.load["15m"]}`
                  : "—",
              ],
              ["IP", process.env.NEXT_PUBLIC_VPS_HOST ?? "—"],
              ["Network ↓", metrics ? `${fmt(metrics.network.rxSec)}/s` : "—"],
              ["Network ↑", metrics ? `${fmt(metrics.network.txSec)}/s` : "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <InfoRow key={k} k={k} v={v} s={s} />
          ))}
        </div>

        <div style={card()}>
          <div
            style={{
              fontSize: 11,
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
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
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
                <span style={{ fontSize: 11, color: s.purple }}>{p.cpu}%</span>
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
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <span
              style={{ fontSize: 11, color: s.muted, letterSpacing: "0.13em" }}
            >
              QUICK ACCESS
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setQaCols(n)}
                  style={{
                    width: 26,
                    height: 22,
                    background:
                      qaCols === n ? "rgba(148,120,255,0.25)" : "transparent",
                    border: `0.5px solid ${qaCols === n ? "rgba(148,120,255,0.5)" : s.border}`,
                    borderRadius: 5,
                    color: qaCols === n ? s.purple : s.muted,
                    fontFamily: s.mono,
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${qaCols}, 1fr)`,
              gap: 12,
            }}
          >
            {[
              {
                id: "terminal",
                icon: ">_",
                label: "Terminal",
                sub: "SSH Console",
                always: true,
                flag: "metrics" as const,
                qaKey: "NEXT_PUBLIC_QA_TERMINAL",
              },
              {
                id: "monitor",
                icon: "◈",
                label: "Monitor",
                sub: "Realtime",
                always: false,
                flag: "metrics" as const,
                qaKey: "NEXT_PUBLIC_QA_MONITOR",
              },
              {
                id: "docker",
                icon: "▣",
                label: "Docker",
                sub: "Containers",
                always: false,
                flag: "docker" as const,
                qaKey: "NEXT_PUBLIC_QA_DOCKER",
              },
              {
                id: "pm2",
                icon: "⟳",
                label: "PM2",
                sub: "Processes",
                always: false,
                flag: "pm2" as const,
                qaKey: "NEXT_PUBLIC_QA_PM2",
              },
              {
                id: "files",
                icon: "⊟",
                label: "Files",
                sub: "SFTP",
                always: false,
                flag: "files" as const,
                qaKey: "NEXT_PUBLIC_QA_FILES",
              },
              {
                id: "cv",
                icon: "✎",
                label: "CV Editor",
                sub: "PDF Export",
                always: false,
                flag: "cv" as const,
                qaKey: "NEXT_PUBLIC_QA_CV",
              },
            ]
              .filter((item) => {
                const modOn = item.always || modules[item.flag];
                const qaOn = process.env[item.qaKey] !== "false";
                return modOn && qaOn;
              })
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => setTab(item.id as TabId)}
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: `0.5px solid ${s.border}`,
                    borderRadius: 12,
                    padding: "20px 14px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(148,120,255,0.35)";
                    e.currentTarget.style.background = "rgba(128,96,208,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = s.border;
                    e.currentTarget.style.background =
                      "rgba(255,255,255,0.025)";
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 9 }}>
                    {item.icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11, color: s.muted, marginTop: 4 }}>
                    {item.sub}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
