module.exports = {
  apps: [
    {
      name: "solicitudes-pension",
      cwd: "/var/www/bracekts-system",
      script: "server/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M"
    }
  ]
};
