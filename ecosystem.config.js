module.exports = {
  apps: [
    {
      name: "console-ssh",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/root/console-ssh",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "socket-server",
      script: "socket-server.ts",
      interpreter: "node_modules/.bin/tsx",
      cwd: "/root/console-ssh",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
