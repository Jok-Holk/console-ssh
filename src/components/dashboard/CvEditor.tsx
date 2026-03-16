"use client";
import { useState, useEffect, useRef } from "react";
import { S } from "./shared";

export default function CvEditor({
  authFetch,
  s,
}: {
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [md, setMd] = useState("");
  const [css, setCss] = useState("");
  const [activePanel, setActivePanel] = useState<"md" | "css">("md");
  const [loading, setLoading] = useState(false);
  const [savingMd, setSavingMd] = useState(false);
  const [savingCss, setSavingCss] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load MD when lang changes
  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await authFetch(`/api/cv/md?lang=${lang}`);
      if (res?.ok) {
        const { content } = await res.json();
        setMd(content);
      }
      setLoading(false);
    })();
  }, [lang, authFetch]);

  // Load CSS once on mount
  useEffect(() => {
    (async () => {
      const res = await authFetch("/api/cv/css");
      if (res?.ok) {
        const { content } = await res.json();
        setCss(content);
      }
    })();
  }, [authFetch]);

  // Debounced live preview — re-render when MD or CSS changes
  useEffect(() => {
    if (!md) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/cv/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, md, css }),
        });
        if (res.ok && previewRef.current) {
          previewRef.current.srcdoc = await res.text();
        } else if (!res.ok && previewRef.current) {
          const errMsg =
            res.status === 502
              ? "CV service is not running. Start cv-service or check Settings."
              : `Preview error: HTTP ${res.status}`;
          previewRef.current.srcdoc = `<html><body style="background:#0f0f1e;color:#f87171;font-family:monospace;padding:20px;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><div style="font-size:24px;margin-bottom:12px">⚠</div><div>${errMsg}</div></div></body></html>`;
        }
      } catch {
        if (previewRef.current) {
          previewRef.current.srcdoc = `<html><body style="background:#0f0f1e;color:#f87171;font-family:monospace;padding:20px;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><div style="font-size:24px;margin-bottom:12px">⚠</div><div>Cannot reach CV service</div></div></body></html>`;
        }
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [md, css, lang]);

  const handleSaveMd = async () => {
    setSavingMd(true);
    const res = await authFetch("/api/cv/md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, content: md }),
    });
    setSavingMd(false);
    setSaveMsg(res?.ok ? "MD saved ✓" : "Save failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleSaveCss = async () => {
    setSavingCss(true);
    const res = await authFetch("/api/cv/css", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: css }),
    });
    setSavingCss(false);
    setSaveMsg(res?.ok ? "CSS saved ✓" : "Save failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/cv/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, md, css }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + String(err));
    }
    setExporting(false);
  };

  const btn = (
    color: string,
    border: string,
    bg = "transparent",
  ): React.CSSProperties => ({
    padding: "7px 16px",
    background: bg,
    border: `0.5px solid ${border}`,
    borderRadius: 8,
    color,
    fontFamily: s.mono,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        gap: 12,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Lang */}
        <div
          style={{
            display: "flex",
            border: `0.5px solid ${s.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {(["vi", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: "7px 16px",
                background: lang === l ? "rgba(128,96,208,0.2)" : "transparent",
                border: "none",
                color: lang === l ? s.purple : s.muted,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Panel toggle */}
        <div
          style={{
            display: "flex",
            border: `0.5px solid ${s.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {(["md", "css"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setActivePanel(p)}
              style={{
                padding: "7px 16px",
                background:
                  activePanel === p ? "rgba(128,96,208,0.2)" : "transparent",
                border: "none",
                color: activePanel === p ? s.purple : s.muted,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {p === "md" ? "Markdown" : "CSS"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

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
        {loading && (
          <span style={{ fontSize: 12, color: s.amber }}>Loading...</span>
        )}

        {activePanel === "md" ? (
          <button
            onClick={handleSaveMd}
            disabled={savingMd || loading}
            style={{
              ...btn(s.green, "rgba(74,222,128,0.3)"),
              opacity: savingMd ? 0.5 : 1,
            }}
          >
            {savingMd ? "Saving..." : "Save MD"}
          </button>
        ) : (
          <button
            onClick={handleSaveCss}
            disabled={savingCss}
            style={{
              ...btn(s.cyan, "rgba(56,189,248,0.3)"),
              opacity: savingCss ? 0.5 : 1,
            }}
          >
            {savingCss ? "Saving..." : "Save CSS"}
          </button>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || loading}
          style={{
            ...btn("#c4adff", "rgba(148,120,255,0.4)", "rgba(128,96,208,0.18)"),
            opacity: exporting ? 0.5 : 1,
          }}
        >
          {exporting ? "Generating..." : "⬇ Export PDF"}
        </button>

        <a
          href={`/api/cv/export?lang=${lang}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btn(s.muted, s.border), textDecoration: "none" }}
        >
          ↗ Public
        </a>
      </div>

      {/* Editor + Preview */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          minHeight: 0,
        }}
      >
        {/* Left: MD or CSS editor */}
        <div
          style={{
            background: s.surface,
            border: `0.5px solid ${s.border}`,
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: `0.5px solid ${s.border}`,
              fontSize: 11,
              color: s.muted,
              letterSpacing: "0.1em",
            }}
          >
            {activePanel === "md"
              ? `MARKDOWN — resume-${lang}.md`
              : "CSS — styles.css"}
          </div>
          <textarea
            value={activePanel === "md" ? md : css}
            onChange={(e) =>
              activePanel === "md"
                ? setMd(e.target.value)
                : setCss(e.target.value)
            }
            spellCheck={false}
            placeholder={activePanel === "md" ? "Loading..." : "Loading CSS..."}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              padding: "14px 16px",
              color: activePanel === "css" ? s.cyan : s.text,
              fontFamily: s.mono,
              fontSize: 12,
              lineHeight: 1.75,
              outline: "none",
            }}
          />
        </div>

        {/* Right: Preview */}
        <div
          style={{
            background: "#fff",
            border: `0.5px solid ${s.border}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "0.5px solid #eee",
              fontSize: 11,
              color: "#888",
              letterSpacing: "0.1em",
              background: "#fafafa",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>PREVIEW — A4</span>
            <span style={{ fontSize: 10, color: "#bbb" }}>
              live · 500ms debounce
            </span>
          </div>
          <iframe
            ref={previewRef}
            title="CV Preview"
            style={{ flex: 1, border: "none", background: "#fff" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Footer links */}
      <div style={{ fontSize: 11, color: s.muted }}>
        Download link:
        <code
          style={{
            margin: "0 8px",
            color: s.cyan,
            background: "rgba(0,0,0,0.2)",
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          /api/cv/export?lang=vi
        </code>
        <code
          style={{
            color: s.cyan,
            background: "rgba(0,0,0,0.2)",
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          /api/cv/export?lang=en
        </code>
      </div>
    </div>
  );
}
