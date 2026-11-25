#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/bracekts-system}"
cd "$APP_DIR"

: "${SESSION_SECRET:?Falta el secreto SESSION_SECRET}"
: "${ADMIN_EMAIL:?Falta ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Falta ADMIN_PASSWORD}"
: "${DB_PASSWORD:?Falta DB_PASSWORD}"

umask 077
cat > .env << EOF
PORT=3080
SESSION_SECRET=${SESSION_SECRET}
ADMIN_NAME=${ADMIN_NAME:-Administrador}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
LOCAL_HINT=0
COOKIE_SECURE=${COOKIE_SECURE:-1}
TRUST_PROXY=${TRUST_PROXY:-1}
HOST=127.0.0.1
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER:-supuser}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME:-solicitudes_pension}
EOF

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado. No se cambia el Node del sistema." >&2
  exit 1
fi

npm ci --omit=dev
mkdir -p data/archivos

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if pm2 describe solicitudes-pension >/dev/null 2>&1; then
  pm2 reload solicitudes-pension --update-env
else
  pm2 start ecosystem.config.cjs --update-env
fi
pm2 save
