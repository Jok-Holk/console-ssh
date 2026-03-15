/**
 * ecosystem.config.js
 * PM2 process config for VPS Manager.
 * Edit APP_DIR and process names to match your setup.
 */

const APP_DIR = process.env.APP_DIR || __dirname;
const PM2_NAME = process.env.PM2_APP_NAME || "vps-manager";

module.exports = {
  apps: [
    // ── Main Next.js app ───────────────────────────────────────
    {
      name: PM2_NAME,
      script: "node_modules/.bin/next",
      args: "start",
      cwd: APP_DIR,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
    },

    // ── Socket server (SSH terminal relay) ────────────────────
    {
      name: "socket-server",
      script: "socket-server.ts",
      interpreter: "node_modules/.bin/tsx",
      cwd: APP_DIR,
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
    },

    // ── CV Service (optional — only start if you need CV Editor)
    // Uncomment to enable:
    // {
    //   name: "cv-service",
    //   script: "./dist/server/entry.mjs",
    //   cwd: APP_DIR + "/cv-service",
    //   env: {
    //     NODE_ENV: "production",
    //     HOST: "0.0.0.0",
    //     PORT: 4321,
    //   },
    //   autorestart: true,
    // },
  ],
};
