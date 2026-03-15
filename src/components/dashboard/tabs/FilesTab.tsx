"use client";
import { useState } from "react";
import { FileEntry, fmt, S } from "../shared";
import FileEditor from "../FileEditor";

interface Props {
  files: FileEntry[];
  filePath: string;
  fileContent: { name: string; content: string } | null;
  loading: boolean;
  setFilePath: (p: string) => void;
  setFileContent: (c: { name: string; content: string } | null) => void;
  fetchFiles: (p: string) => void;
  authFetch: (u: string, o?: RequestInit) => Promise<Response | null>;
  s: S;
}

export default function FilesTab({
  files,
  filePath,
  fileContent,
  loading,
  setFilePath,
  setFileContent,
  fetchFiles,
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

  const downloadFile = async (path: string, name: string) => {
    const res = await authFetch(
      `/api/files?path=${encodeURIComponent(path)}&download=1`,
    );
    if (!res?.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async (path: string) => {
    const res = await authFetch(
      `/api/files?path=${encodeURIComponent(path)}&zip=1`,
    );
    if (!res?.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${path.split("/").pop()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const viewFile = async (path: string, name: string) => {
    const res = await authFetch(
      `/api/files?path=${encodeURIComponent(path)}&view=1`,
    );
    if (!res?.ok) return;
    const content = await res.text();
    setFileContent({ name, content });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: fileContent ? "minmax(320px, 1fr) 1.5fr" : "1fr",
        gap: 14,
        height: "calc(100vh - 120px)",
      }}
    >
      <div
        style={{
          ...card(),
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {filePath
            .split("/")
            .filter(Boolean)
            .map((seg, i, arr) => {
              const p = "/" + arr.slice(0, i + 1).join("/");
              return (
                <span
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  {i > 0 && (
                    <span style={{ color: s.muted, fontSize: 13 }}>/</span>
                  )}
                  <button
                    onClick={() => fetchFiles(p)}
                    style={{
                      background: "none",
                      border: "none",
                      color: i === arr.length - 1 ? s.text : s.purple,
                      fontFamily: s.mono,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <label
              style={{
                padding: "6px 12px",
                background: "rgba(148,120,255,0.1)",
                border: "0.5px solid rgba(148,120,255,0.28)",
                borderRadius: 8,
                color: s.purple,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ↑ Upload
              <input
                type="file"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append("file", file);
                  form.append("path", filePath);
                  const res = await authFetch("/api/files", {
                    method: "POST",
                    body: form,
                  });
                  if (res?.ok) fetchFiles(filePath);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => downloadZip(filePath)}
              style={{
                padding: "6px 12px",
                background: "transparent",
                border: `0.5px solid ${s.border}`,
                borderRadius: 8,
                color: s.muted,
                fontFamily: s.mono,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ↓ zip
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: s.muted,
                fontSize: 13,
              }}
            >
              Loading...
            </div>
          ) : (
            files.map((f) => (
              <div
                key={f.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 6px",
                  borderBottom: `0.5px solid ${s.border}`,
                  fontSize: 13,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(128,96,208,0.07)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <span
                  style={{
                    color:
                      f.type === "dir" ? s.amber : "rgba(255,255,255,0.25)",
                    width: 14,
                    flexShrink: 0,
                    fontSize: 12,
                  }}
                >
                  {f.type === "dir" ? "▸" : "·"}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: f.type === "dir" ? s.text : "rgba(255,255,255,0.55)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    f.type === "dir"
                      ? fetchFiles(`${filePath}/${f.name}`)
                      : f.viewable
                        ? viewFile(`${filePath}/${f.name}`, f.name)
                        : null
                  }
                >
                  {f.name}
                </span>
                <span style={{ fontSize: 11, color: s.muted, flexShrink: 0 }}>
                  {f.modified}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: s.muted,
                    width: 54,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {f.type === "file" ? fmt(f.size) : ""}
                </span>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {f.viewable && (
                    <button
                      onClick={() => viewFile(`${filePath}/${f.name}`, f.name)}
                      style={{
                        padding: "3px 9px",
                        background: "transparent",
                        border: "0.5px solid rgba(56,189,248,0.25)",
                        borderRadius: 5,
                        color: s.cyan,
                        fontFamily: s.mono,
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      view
                    </button>
                  )}
                  {f.type === "file" && (
                    <button
                      onClick={() =>
                        downloadFile(`${filePath}/${f.name}`, f.name)
                      }
                      style={{
                        padding: "3px 9px",
                        background: "transparent",
                        border: "0.5px solid rgba(148,120,255,0.22)",
                        borderRadius: 5,
                        color: s.purple,
                        fontFamily: s.mono,
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      ↓
                    </button>
                  )}
                  {f.type === "dir" && (
                    <button
                      onClick={() => downloadZip(`${filePath}/${f.name}`)}
                      style={{
                        padding: "3px 9px",
                        background: "transparent",
                        border: "0.5px solid rgba(148,120,255,0.22)",
                        borderRadius: 5,
                        color: s.purple,
                        fontFamily: s.mono,
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      zip
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${f.name}"?`)) return;
                      const res = await authFetch(
                        `/api/files?path=${encodeURIComponent(`${filePath}/${f.name}`)}&type=${f.type}`,
                        { method: "DELETE" },
                      );
                      if (res?.ok) {
                        if (fileContent?.name === f.name) setFileContent(null);
                        fetchFiles(filePath);
                      }
                    }}
                    style={{
                      padding: "3px 9px",
                      background: "transparent",
                      border: "0.5px solid rgba(248,113,113,0.2)",
                      borderRadius: 5,
                      color: s.red,
                      fontFamily: s.mono,
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {fileContent && (
        <FileEditor
          key={fileContent.name}
          fileContent={fileContent}
          filePath={filePath}
          authFetch={authFetch}
          onClose={() => setFileContent(null)}
          downloadFile={downloadFile}
          s={s}
        />
      )}
    </div>
  );
}
