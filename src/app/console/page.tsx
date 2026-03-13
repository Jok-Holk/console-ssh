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
        // Disable local echo — SSH server handles all echo
        disableStdin: false,
        theme: {
          background: "#080812",
          foreground: "#e0e0ff",
          cursor: "#a855f7",
          cursorAccent: "#080812",
          selectionBackground: "rgba(168,85,247,0.3)",
          black: "#080812",
          brightBlack: "#4a4a6a",
          red: "#f87171",
          brightRed: "#fca5a5",
          green: "#4ade80",
          brightGreen: "#86efac",
          yellow: "#f59e0b",
          brightYellow: "#fcd34d",
          blue: "#818cf8",
          brightBlue: "#a5b4fc",
          magenta: "#a855f7",
          brightMagenta: "#c084fc",
          cyan: "#22d3ee",
          brightCyan: "#67e8f9",
          white: "#e0e0ff",
          brightWhite: "#ffffff",
        },
        fontSize: 14,
        fontFamily: "'Space Mono', 'Courier New', monospace",
        scrollback: 5000,
        allowTransparency: true,
      });

      fitAddon.current = new FitAddon();
      term.current.loadAddon(fitAddon.current);
      term.current.open(termRef.current);
      fitAddon.current.fit();
      term.current.focus();

      // Fetch token server-side (cookie is httpOnly, can't read from JS)
      const res = await fetch("/api/auth/token");
      if (!res.ok) {
        // Not authenticated — redirect to login
        if (window.self !== window.top) {
          window.top!.location.href = "/";
        } else {
          window.location.href = "/";
        }
        return;
      }
      const { token } = await res.json();

      const wsUrl =
        process.env.NEXT_PUBLIC_WS_URL ?? "https://console.jokholk.dev";
      socket.current = io(wsUrl, {
        path: "/socket.io/",
        auth: (cb) => cb({ token }),
        transports: ["websocket", "polling"],
      });

      socket.current.on("connect", () => {
        term.current?.write("\r\n\x1b[32m● Connected\x1b[0m\r\n\r\n");
      });

      socket.current.on("connect_error", (err: Error) => {
        term.current?.write(
          `\r\n\x1b[31m● Connection failed: ${err.message}\x1b[0m\r\n`,
        );
      });

      // Only write output from server — no local echo
      socket.current.on("output", (data: string) => {
        term.current?.write(data);
      });

      // Send input to server only — do NOT write locally
      term.current.onData((data: string) => {
        socket.current?.emit("input", data);
      });

      term.current.onResize((size: ResizeEvent) => {
        socket.current?.emit("resize", size);
      });

      socket.current.on("disconnect", () => {
        term.current?.write("\r\n\x1b[31m● Disconnected\x1b[0m\r\n");
      });

      // Handle window resize
      const handleResize = () => fitAddon.current?.fit();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    })();

    return () => {
      isMounted = false;
      socket.current?.disconnect();
      term.current?.dispose();
    };
  }, []);

  const logout = async () => {
    // If inside iframe (dashboard), redirect top window to login
    if (window.self !== window.top) {
      const res = await fetch("/api/logout", { method: "POST" });
      if (res.ok) window.top!.location.href = "/";
      return;
    }
    const res = await fetch("/api/logout", { method: "POST" });
    if (res.ok) window.location.href = "/";
  };

  return (
    <div className="w-full h-full bg-[#080812] flex flex-col">
      <div
        ref={termRef}
        className="flex-1 p-2"
        onClick={() => term.current?.focus()}
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
