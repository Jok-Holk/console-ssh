"use client";
import { useState, useRef, useEffect } from "react";
import { S } from "./shared";

type DeployStep = {
  step: string;
  status: "running" | "done" | "skipped";
  output?: string;
};

interface Props {
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}

export default function DeployPanel({ authFetch, s }: Props) {
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
