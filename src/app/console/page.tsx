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
  const buffer = useRef<string>(""); // Buffer to collect full input

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!isMounted || !termRef.current) return;
      const XTermModule = await import("xterm");
      const FitModule = await import("@xterm/addon-fit");
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

      const token =
        document.cookie.split("authToken=")[1]?.split(";")[0] ||
        "default-token";
      socket.current = io("wss://console.jokholk.dev:3001", {
        auth: (cb) => cb({ token }),
      });

      socket.current.on("connect", () => {
        term.current?.write("Connected to VPS...$ ");
      });

      socket.current.on("output", (data: string) => {
        const cleanedData = data.replace(/^\n+|\n+$/g, "");
        term.current?.write(cleanedData);
      });

      term.current.onData((data: string) => {
        if (data === "\r" || data === "\n") {
          if (buffer.current.trim().length > 0) {
            console.log("Sending full command:", buffer.current.trim());
            socket.current?.emit("input", buffer.current.trim() + "\n");
            buffer.current = ""; // Clear buffer after sending
            term.current?.write("\n$ "); // Move to new prompt
          }
        } else if (data.length > 0) {
          buffer.current += data;
          term.current?.write(data); // Echo input locally
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
