import "dotenv/config";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { Client } from "ssh2";
import jwt from "jsonwebtoken";
import fs from "fs";

const port = 3001;
const server = createServer();
const io = new SocketServer(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token || !jwt.verify(token, process.env.JWT_SECRET!, {}))
    return next(new Error("Unauthorized"));
  next();
});

io.on("connection", (socket) => {
  console.log("Socket connected");
  const ssh = new Client();
  ssh
    .on("ready", () => {
      console.log("SSH ready");
      ssh.shell((err: any, stream: any) => {
        if (err) {
          console.error("SSH shell error:", err);
          return socket.disconnect();
        }
        stream.on("close", () => ssh.end());
        stream.on("data", (data: Buffer) =>
          socket.emit("output", data.toString())
        );
        socket.on("input", (data: string) => stream.write(data));
        socket.on("resize", ({ cols, rows }: { cols: number; rows: number }) =>
          stream.setWindow(cols, rows, 0, 0)
        );
        // Emit initial resize
        socket.emit("resize", { cols: 80, rows: 24 });
      });
    })
    .on("error", (err) => console.error("SSH error:", err))

    .connect({
      host: process.env.VPS_HOST,
      port: 22,
      username: process.env.VPS_USER,
      privateKey: fs.readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
    });
  socket.on("disconnect", () => {
    console.log("Socket disconnected");

    ssh.end();
  });
});

server.listen(port, "127.0.0.1", () =>
  console.log(`Socket.io on http://localhost:${port}`)
);
