import "dotenv/config";
import { createServer } from "https";
import { Server as SocketServer } from "socket.io";
import { readFileSync } from "fs";
import { Client } from "ssh2";

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

io.on("connection", (socket) => {
  const ssh = new Client();
  ssh
    .on("ready", () => {
      ssh.shell(
        { term: "xterm-256color", rows: 24, cols: 80 },
        (err: any, stream: any) => {
          if (err) return socket.disconnect();
          stream.on("close", () => ssh.end());
          stream.on("data", (data: Buffer) => {
            const output = data.toString().trim();
            if (output) socket.emit("output", output);
          });
          socket.on("input", (data: string) => {
            if (data.trim()) stream.write(data);
          });
          socket.on(
            "resize",
            ({ cols, rows }: { cols: number; rows: number }) => {
              stream.setWindow(cols, rows, 0, 0);
            }
          );
          stream.setWindow(80, 24, 0, 0);
        }
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

httpsServer.listen(port, "0.0.0.0", () =>
  console.log(`Socket.io on https://localhost:${port}`)
);
