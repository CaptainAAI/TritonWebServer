#!/usr/bin/env bash
# Sets up Triton (Docker) and this web UI (systemd) on a Jetson.
#
#   ./deploy/install.sh
#
# Run it as your normal user from a clone of this repository; it asks for sudo
# where needed. Safe to run again: existing models, compose.yaml and .env.local
# are kept.
#
# Node.js is updated to the latest LTS release (with the latest npm) from
# nodejs.org, installed in /usr/local. Options, as environment variables:
#   TRITON_DIR=/path      Triton folder instead of ~/nvidiatriton
#   NODE_VERSION=v24.22.0 install this Node.js version instead of the latest LTS
#   SKIP_NODE=1           leave Node.js and npm as they are
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
command -v curl >/dev/null || die "curl is not installed"
command -v python3 >/dev/null || die "python3 is not installed"
echo "docker, docker compose, curl and python3 found"

# Installs a Node.js release from nodejs.org into /usr/local, replacing the one there.
install_node() {
  local version="$1" arch file tmp
  case "$(uname -m)" in
    aarch64|arm64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *) die "no Node.js build for $(uname -m)" ;;
  esac
  file="node-$version-linux-$arch.tar.gz"
  tmp="$(mktemp -d)"

  echo "downloading $file"
  curl -fsSL -o "$tmp/$file" "https://nodejs.org/dist/$version/$file"
  curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" | grep " $file\$" > "$tmp/SHASUMS256.txt"
  (cd "$tmp" && sha256sum -c --quiet SHASUMS256.txt) || die "checksum of $file does not match"

  # The bundled npm and corepack are replaced as a whole, so no stale files remain.
  sudo rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/include/node
  sudo tar -xzf "$tmp/$file" -C /usr/local --strip-components=1 --no-same-owner \
    --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' --exclude='*/README.md'
  # Newer releases no longer ship corepack; drop its link if it now points nowhere.
  [ -e /usr/local/bin/corepack ] || sudo rm -f /usr/local/bin/corepack
  rm -rf "$tmp"
  hash -r
}

if [ "${SKIP_NODE:-}" = 1 ]; then
  step "Node.js: SKIP_NODE=1, left as is"
else
  step "Node.js and npm"
  target="${NODE_VERSION:-$(curl -fsSL https://nodejs.org/dist/index.json \
    | python3 -c 'import json, sys; print(next(r["version"] for r in json.load(sys.stdin) if r["lts"]))')}"
  target="v${target#v}"
  current="$(node -v 2>/dev/null || echo none)"

  if [ "$current" = "$target" ]; then
    echo "Node.js $current is up to date"
  elif [ "$current" != none ] && [ -z "${NODE_VERSION:-}" ] \
      && [ "$(printf '%s\n' "$current" "$target" | sort -V | tail -1)" = "$current" ]; then
    echo "Node.js $current is newer than the latest LTS ($target), kept"
  else
    echo "Node.js $current -> $target"
    install_node "$target"
  fi

  export PATH="/usr/local/bin:$PATH"
  [ "$(command -v node)" = /usr/local/bin/node ] \
    || warn "another node comes first on PATH: $(command -v node)"

  npm_latest="$(curl -fsSL https://registry.npmjs.org/npm/latest | python3 -c 'import json, sys; print(json.load(sys.stdin)["version"])')"
  if [ "$(npm -v)" = "$npm_latest" ]; then
    echo "npm $npm_latest is up to date"
  else
    echo "npm $(npm -v) -> $npm_latest"
    # --engine-strict: keep the bundled npm if the latest one does not support this Node.js.
    sudo /usr/local/bin/npm install -g --engine-strict --no-audit --no-fund "npm@$npm_latest" \
      || warn "could not install npm $npm_latest, keeping npm $(npm -v)"
    hash -r
  fi
fi

command -v node >/dev/null && command -v npm >/dev/null || die "Node.js is not installed"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)' \
  || die "Node.js $(node -v) is too old: Next.js 16 needs 20.9 or newer"
echo "using Node.js $(node -v), npm $(npm -v)"

step "Model repository in $TRITON_DIR"
mkdir -p "$TRITON_DIR/model_repository" "$TRITON_DIR/disabled_models"
# Checked file by file: a preprocess folder can exist without its files (e.g. an
# empty folder left after a cleanup). Existing files are never overwritten.
PRE="$TRITON_DIR/model_repository/preprocess"
for f in config.pbtxt 1/dali.py; do
  if [ -f "$PRE/$f" ]; then
    echo "preprocess/$f already there, kept"
  else
    mkdir -p "$(dirname "$PRE/$f")"
    cp "$DEPLOY_DIR/model_repository/preprocess/$f" "$PRE/$f"
    echo "added preprocess/$f (DALI pre-processing)"
  fi
done

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
