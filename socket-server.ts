import "dotenv/config";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { readFileSync } from "fs";
import { Client } from "ssh2";
import jwt from "jsonwebtoken";

const port = 3001;
const httpServer = createServer();

const io = new SocketServer(httpServer, {
  cors: {
    origin: ["https://console.jokholk.dev", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/socket.io/",
});
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  console.log("Token received:", token ? token.substring(0, 20) + "..." : "NONE");
  if (!token) return next(new Error("No token"));
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    console.log("Token valid, connection allowed");
    next();
  } catch (e) {
    console.log("Token invalid:", e);
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const ssh = new Client();
  ssh
    .on("ready", () => {
      ssh.shell(
        {
          term: "xterm-256color",
          rows: 24,
          cols: 80,
        },
        (err: any, stream: any) => {
          if (err) return socket.disconnect();
          stream.on("close", () => ssh.end());
          stream.on("data", (data: Buffer) => {
            socket.emit("output", data.toString());
          });
          socket.on("input", (data: string) => {
            stream.write(data);
          });
          socket.on(
            "resize",
            ({ cols, rows }: { cols: number; rows: number }) => {
              stream.setWindow(rows, cols, 0, 0);
            },
          );
          stream.setWindow(24, 80, 0, 0);
        },
      );
    })
    .on("error", () => {})
    .connect({
      host: process.env.VPS_HOST,
      port: 22,
      username: process.env.VPS_USER,
      privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
    });
  socket.on("disconnect", () => ssh.end());
});

httpServer.listen(port, "0.0.0.0", () =>
  console.log(`Socket.io on http://localhost:${port}`),
);
