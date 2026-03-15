"use client";
import {
  Bar,
  Sparkline,
  NetworkChart,
  InfoRow,
  fmt,
  fmtKB,
  S,
  Metrics,
} from "../shared";

interface Props {
  metrics: Metrics | null;
  cpuHistory: number[];
  ramHistory: number[];
  rxHistory: number[];
  txHistory: number[];
  s: S;
}

export default function MonitorTab({
  metrics,
  cpuHistory,
  ramHistory,
  rxHistory,
  txHistory,
  s,
}: Props) {
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: s.surface,
    border: `0.5px solid ${s.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...extra,
  });

  if (!metrics)
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 0",
          color: s.muted,
          fontSize: 13,
        }}
      >
        Waiting for metrics...
      </div>
    );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 9,
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}>
              ▼ READ
            </div>
            <div style={{ fontSize: 17, fontWeight: 500, color: s.green }}>
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
            <div style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}>
              ▲ WRITE
            </div>
            <div style={{ fontSize: 17, fontWeight: 500, color: s.amber }}>
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
            <div style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}>
              ↓ DOWNLOAD
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: s.green }}>
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
            <div style={{ fontSize: 10, color: s.muted, marginBottom: 5 }}>
              ↑ UPLOAD
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: s.purple }}>
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
            style={{ fontSize: 10, color: s.muted, letterSpacing: "0.13em" }}
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
  );
}
