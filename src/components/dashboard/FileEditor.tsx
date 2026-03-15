"use client";
import { useState, useRef } from "react";
import { S } from "./shared";

interface Props {
  fileContent: { name: string; content: string };
  filePath: string;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response | null>;
  onClose: () => void;
  downloadFile: (path: string, name: string) => void;
  s: S;
}

export default function FileEditor({
  fileContent,
  filePath,
  authFetch,
  onClose,
  downloadFile,
  s,
}: Props) {
  const savedContent = useRef(fileContent.content);
  const [editContent, setEditContent] = useState(fileContent.content);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const isDirty = editContent !== savedContent.current;
  const fullPath = `${filePath}/${fileContent.name}`;

  const handleSave = async () => {
    setSaving(true);
    const res = await authFetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fullPath, content: editContent }),
    });
    setSaving(false);
    if (res?.ok) {
      savedContent.current = editContent;
      setSaveMsg("Saved ✓");
    } else setSaveMsg("Failed");
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const btn = (color: string, border?: string): React.CSSProperties => ({
    padding: "5px 12px",
    background: "transparent",
    border: `0.5px solid ${border ?? "rgba(255,255,255,0.12)"}`,
    borderRadius: 7,
    color,
    fontFamily: s.mono,
    fontSize: 11,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        background: s.surface,
        border: `0.5px solid ${s.border}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            color: s.cyan,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fileContent.name}
          {isDirty && !saveMsg && (
            <span style={{ color: s.amber, marginLeft: 8, fontSize: 10 }}>
              ● modified
            </span>
          )}
          {saveMsg && (
            <span
              style={{
                color: saveMsg.includes("✓") ? s.green : s.red,
                marginLeft: 8,
                fontSize: 10,
              }}
            >
              {saveMsg}
            </span>
          )}
        </span>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{
            ...btn(
              isDirty ? s.green : s.muted,
              isDirty ? "rgba(74,222,128,0.3)" : undefined,
            ),
            opacity: isDirty ? 1 : 0.35,
            cursor: isDirty ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => downloadFile(fullPath, fileContent.name)}
          style={btn(s.purple, "rgba(168,85,247,0.3)")}
        >
          ↓
        </button>
        <button onClick={onClose} style={btn(s.muted)}>
          ✕
        </button>
      </div>
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          resize: "none",
          background: "rgba(0,0,0,0.3)",
          border: `0.5px solid ${isDirty ? "rgba(148,120,255,0.3)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 9,
          padding: "12px 14px",
          color: s.text,
          fontFamily: s.mono,
          fontSize: 12,
          lineHeight: 1.75,
          outline: "none",
          transition: "border-color 0.2s",
          minHeight: 200,
        }}
      />
    </div>
  );
}
