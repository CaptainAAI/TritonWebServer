#!/usr/bin/env bash
# Sets up Triton (Docker) and this web UI (systemd) on a Jetson.
#
#   ./deploy/install.sh
#
# Run it as your normal user from a clone of this repository; it asks for sudo
# where needed. Safe to run again: existing models, compose.yaml and .env.local
# are kept. Set TRITON_DIR to put the Triton folder somewhere else than
# ~/nvidiatriton.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"
TRITON_DIR="${TRITON_DIR:-$HOME/nvidiatriton}"
SERVICE=tritonserver

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as your normal user, not root (the web UI runs as the user who installs it)"

step "Checking prerequisites"
command -v docker >/dev/null || die "docker is not installed"
sudo docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"
sudo docker info 2>/dev/null | grep -qi 'runtimes:.*nvidia' \
  || warn "Docker has no 'nvidia' runtime; Triton needs the NVIDIA Container Toolkit"
command -v node >/dev/null && command -v npm >/dev/null || die "Node.js is not installed (needs 20.9 or newer)"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)' \
  || die "Node.js $(node -v) is too old: Next.js 16 needs 20.9 or newer"
echo "docker, docker compose and Node.js $(node -v) found"

step "Model repository in $TRITON_DIR"
mkdir -p "$TRITON_DIR/model_repository" "$TRITON_DIR/disabled_models"
if [ -e "$TRITON_DIR/model_repository/preprocess" ]; then
  echo "preprocess model already there, kept"
else
  cp -r "$DEPLOY_DIR/model_repository/preprocess" "$TRITON_DIR/model_repository/"
  echo "added the preprocess (DALI) model"
fi

if [ -e "$TRITON_DIR/compose.yaml" ]; then
  cmp -s "$DEPLOY_DIR/compose.yaml" "$TRITON_DIR/compose.yaml" \
    || warn "$TRITON_DIR/compose.yaml differs from deploy/compose.yaml, kept as is"
else
  cp "$DEPLOY_DIR/compose.yaml" "$TRITON_DIR/compose.yaml"
  echo "added compose.yaml"
fi

step "Web UI settings (.env.local)"
if [ -e "$REPO_DIR/.env.local" ]; then
  echo ".env.local already there, kept:"
  sed 's/^/  /' "$REPO_DIR/.env.local"
else
  cat > "$REPO_DIR/.env.local" <<EOF
API_URL=http://127.0.0.1:8000
MODEL_REPOSITORY_PATH=$TRITON_DIR/model_repository
MODEL_CONTROL_MODE=poll
EOF
  echo "created .env.local"
fi

step "Building the web UI"
cd "$REPO_DIR"
npm ci --no-audit --no-fund
npm run build

step "Starting Triton (the first run downloads a large image)"
(cd "$TRITON_DIR" && sudo docker compose up -d)

step "Installing the $SERVICE service"
NPM="$(command -v npm)"
sed -e "s|@USER@|$(id -un)|" \
    -e "s|@WORKDIR@|$REPO_DIR|" \
    -e "s|@NODE_DIR@|$(dirname "$(command -v node)")|" \
    -e "s|@NPM@|$NPM|" \
    "$DEPLOY_DIR/$SERVICE.service" | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null 2>&1
sudo systemctl restart "$SERVICE"

step "Waiting for Triton and the web UI"
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8000/v2/health/live >/dev/null && curl -sf -o /dev/null http://127.0.0.1:3000/repo; then
    IP="$(hostname -I | awk '{print $1}')"
    printf '\n\033[1;32mDone.\033[0m Open http://%s:3000\n' "$IP"
    exit 0
  fi
  sleep 5
done
warn "not ready after 5 minutes. Check: sudo docker logs triton / journalctl -u $SERVICE"
exit 1
