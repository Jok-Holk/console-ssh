"use client";
import { useEffect, useRef } from "react";
import io from "socket.io-client";
import type { Terminal } from "xterm";
import type { FitAddon } from "@xterm/addon-fit";
type ResizeEvent = { cols: number; rows: number };
export default function ConsolePage() {
  const termRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const socket = useRef<ReturnType<typeof io> | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!isMounted || !termRef.current) return;
      const XTermModule = await import("xterm");
      const FitModule = await import("@xterm/addon-fit");
      // @ts-expect-error xterm css import
      await import("xterm/css/xterm.css");
      const { Terminal } = XTermModule;
      const { FitAddon } = FitModule;
      term.current = new Terminal({
        cursorBlink: true,
        theme: {
          background: "#0f0f23",
          foreground: "#e0e0ff",
          cursor: "#9370db",
        },
        fontSize: 16,
        scrollback: 1000,
      });
      fitAddon.current = new FitAddon();
      term.current.loadAddon(fitAddon.current);
      term.current.open(termRef.current);
      fitAddon.current.fit();
      term.current.focus();
      const res = await fetch("/api/auth/token");
if (!res.ok) return;
const { token } = await res.json();
      const wsUrl =
        process.env.NEXT_PUBLIC_WS_URL ?? "wss://console.jokholk.dev:3001";
      socket.current = io(wsUrl, {
        path: "/socket.io/",
        auth: (cb) => cb({ token }),
      });
      socket.current.on("connect", () => {});
      socket.current.on("output", (data: string) => {
        term.current?.write(data);
      });
      term.current.onData((data: string) => {
        const code = data.charCodeAt(0);
        if (code === 13) {
          // Enter
          socket.current?.emit("input", "\n");
          term.current?.write("\r\n");
        } else if (code === 127) {
          // Backspace
          socket.current?.emit("input", data);
          term.current?.write("\b \b");
        } else {
          socket.current?.emit("input", data);
          term.current?.write(data);
        }
      });
      term.current.onResize((size: ResizeEvent) => {
        fitAddon.current?.fit();
        socket.current?.emit("resize", size);
      });
      socket.current.on("disconnect", () => {
        term.current?.write("\r\nDisconnected.\r\n");
      });
    })();
    return () => {
      isMounted = false;
      socket.current?.disconnect();
      term.current?.dispose();
    };
  }, []);
  const logout = async () => {
  // If inside iframe (dashboard), just go back to dashboard
  if (window.self !== window.top) {
    window.top!.location.href = "/dashboard";
    return;
  }
  const res = await fetch("/api/logout", { method: "POST" });
  if (res.ok) window.location.href = "/";
};
  return (
    <div className="min-h-screen bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl neon-purple rounded-xl overflow-auto">
        <header className="p-4 border-b border-purple-500/30 flex justify-between">
          <h1 className="text-xl font-bold text-purple-300">Terminal</h1>
          <button onClick={logout} className="neon-btn text-sm">
            Logout
          </button>
        </header>
        <div
          ref={termRef}
          className="h-[calc(100vh-200px)] p-4"
          onClick={() => term.current?.focus()}
        />
      </div>
    </div>
  );
}
