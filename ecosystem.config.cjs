module.exports = {
  apps: [
    {
      name: "solicitudes-pension",
      script: "server/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M"
    }
  ]
};
