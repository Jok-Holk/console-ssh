module.exports = {
  apps: [
    {
      name: "console-ssh",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/root/console-ssh",
      env: { NODE_ENV: "production", PORT: 3000 },
      max_memory_restart: "400M",
    },
    {
      name: "socket-server",
      script: "./socket-server.ts",
      interpreter: "node_modules/.bin/ts-node",
      cwd: "/root/console-ssh",
      env: { NODE_ENV: "production" },
    },
    {
      name: "cv-service",
      script: "./dist/server/entry.mjs",
      cwd: "/root/console-ssh/cv-service",
      env: { NODE_ENV: "production", HOST: "0.0.0.0", PORT: 4321 },
      max_memory_restart: "300M",
    },
  ],
};
