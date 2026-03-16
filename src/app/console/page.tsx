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
          background: "#080812",
          foreground: "#e0e0ff",
          cursor: "#a855f7",
          cursorAccent: "#080812",
          selectionBackground: "rgba(168,85,247,0.3)",
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

      const res = await fetch("/api/auth/token");
      if (!res.ok) {
        window.location.href = "/";
        return;
      }
      const { token } = await res.json();

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
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
      socket.current.on("data", (data: string) => {
        term.current?.write(data);
      });
      term.current.onData((data: string) => {
        socket.current?.emit("data", data);
      });
      term.current.onResize((size: ResizeEvent) => {
        socket.current?.emit("resize", size);
      });
      socket.current.on("disconnect", () => {
        term.current?.write("\r\n\x1b[31m● Disconnected\x1b[0m\r\n");
      });

      const handleResize = () => fitAddon.current?.fit();
      window.addEventListener("resize", handleResize);
      const observer = new ResizeObserver(() => fitAddon.current?.fit());
      if (termRef.current) observer.observe(termRef.current);
      setTimeout(() => fitAddon.current?.fit(), 100);
      setTimeout(() => fitAddon.current?.fit(), 500);

      return () => {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      };
    })();

    return () => {
      isMounted = false;
      socket.current?.disconnect();
      term.current?.dispose();
    };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#080812",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        ref={termRef}
        style={{ flex: 1, padding: "4px 8px", minHeight: 0 }}
        onClick={() => term.current?.focus()}
      />
    </div>
  );
}
