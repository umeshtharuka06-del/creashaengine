// PM2 process definition for the Royal 1 engine.
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup        # then run the command it prints (enables boot start)
//
// Runs the TypeScript worker directly via the local `tsx` binary, so there is
// no build step. PM2 keeps it alive and restarts it on crash or server reboot.
module.exports = {
  apps: [
    {
      name: "royal-engine",
      script: "./node_modules/.bin/tsx",
      args: "scripts/settle-worker.ts",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 2000,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
      // PM2's own capture of stdout/stderr (the app also writes to ./logs/*).
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
