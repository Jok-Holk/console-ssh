import "dotenv/config";
import { createServer } from "https";
import { Server as SocketServer } from "socket.io";
import { readFileSync } from "fs";
import { Client } from "ssh2";

console.log("VPS_HOST:", process.env.VPS_HOST);

const port = 3001;
const httpsServer = createServer({
  cert: readFileSync("/etc/letsencrypt/live/console.jokholk.dev/fullchain.pem"),
  key: readFileSync("/etc/letsencrypt/live/console.jokholk.dev/privkey.pem"),
});
const io = new SocketServer(httpsServer, {
  cors: {
    origin: ["https://console.jokholk.dev", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/socket.io/",
});

io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err.req?.url, err.message, err.context);
});

io.engine.on("headers", (headers, req) => {
  console.log("Received headers:", headers, "for request:", req.url);
});

io.engine.on("upgrade", (req) => {
  console.log("WebSocket upgrade attempt:", req.url, "headers:", req.headers);
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  const ssh = new Client();
  ssh
    .on("ready", () => {
      console.log("SSH ready for socket:", socket.id);
      ssh.shell({ term: "xterm-256color" }, (err: any, stream: any) => {
        if (err) {
          console.error("SSH shell error for socket", socket.id, ":", err);
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
        stream.setWindow(80, 24, 0, 0);
      });
    })
    .on("error", (err) =>
      console.error("SSH error for socket", socket.id, ":", err)
    )
    .connect({
      host: process.env.VPS_HOST,
      port: 22,
      username: process.env.VPS_USER,
      privateKey: readFileSync(process.env.VPS_PRIVATE_KEY_PATH!),
    });
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    ssh.end();
  });
});

httpsServer.listen(port, "0.0.0.0", () =>
  console.log(`Socket.io on https://localhost:${port}`)
);
