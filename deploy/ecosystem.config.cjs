// PM2 process file:  pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
// It runs from the server/ folder so server/.env is picked up.
// Prefer deploy/linkhub.service (systemd): it also sandboxes the process and runs it as its own user.
// If you use PM2, run it as an unprivileged user - never as root.
module.exports = {
  apps: [
    {
      name: 'linkhub',
      cwd: __dirname + '/../server',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
