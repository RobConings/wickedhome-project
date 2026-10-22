#!/usr/bin/env bash
# Install as root-owned /usr/local/sbin/wickedhome-deploy (0755).
# Invoked by a dedicated unprivileged self-hosted runner, with exactly one SHA.
# This helper NEVER restarts the other wickedhome-* PM2 processes.
set -Eeuo pipefail
umask 027

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Expected full 40-character commit SHA" >&2; exit 2; }
[[ "$(id -u)" -eq 0 ]] || { echo "Must be executed through sudo" >&2; exit 1; }

OWNER=wicked
APP=wickedhome
STATE=/var/www/wickedhome-deploy
RELEASES="$STATE/releases"
SHARED="$STATE/shared"
# Keep the long-lived development/Storybook checkout at /var/www/WickedHome
# completely untouched. Production switches releases through a separate link.
ROOT=/var/www/wickedhome-live
REPO=git@github.com:RobConings/WickedHome.git

[[ -L "$ROOT" && -d "$RELEASES" && -f "$SHARED/.env" && -d /var/www/WickedHome ]] || {
  echo "Release symlink/shared .env not configured; deployment disabled" >&2; exit 1;
}

# Never activate a release that would lose user-uploaded documents.
# The app defaults to STORAGE_DIR=data/files if .env does not specify one.
STORAGE_DIR_VALUE="$(runuser -u "$OWNER" -- /usr/bin/node --env-file="$SHARED/.env" -e 'process.stdout.write(process.env.STORAGE_DIR || "data/files")')"
if [[ "$STORAGE_DIR_VALUE" == /* ]]; then
  [[ -d "$STORAGE_DIR_VALUE" ]] || {
    echo "Configured absolute STORAGE_DIR does not exist" >&2; exit 1;
  }
else
  [[ "$STORAGE_DIR_VALUE" == data || "$STORAGE_DIR_VALUE" == data/* ]] || {
    echo "Relative STORAGE_DIR must live beneath data/ for release layout" >&2; exit 1;
  }
  [[ -d "$SHARED/data" ]] || {
    echo "Relative STORAGE_DIR requires shared/data to preserve uploads" >&2; exit 1;
  }
fi

exec 9>/run/lock/wickedhome-deploy.lock
flock -n 9 || { echo "Deployment already running" >&2; exit 1; }

pm2_cmd() {
  runuser -u "$OWNER" -- /usr/bin/env \
    HOME="/home/$OWNER" PM2_HOME="/home/$OWNER/.pm2" \
    PATH="/usr/local/bin:/usr/bin:/bin" pm2 "$@"
}

activate() {
  local target="$1"
  ln -s "$target" "$STATE/next-release"
  mv -Tf "$STATE/next-release" "$ROOT"
}

restart_wickedhome_only() {
  # PM2 restart alone can retain the old resolved cwd across a symlink switch.
  # Delete/re-create ONLY "wickedhome"; do not touch search, dev, tts, storybook.
  if pm2_cmd describe "$APP" >/dev/null 2>&1; then
    pm2_cmd delete "$APP"
  fi
  runuser -u "$OWNER" -- /usr/bin/env \
    HOME="/home/$OWNER" PM2_HOME="/home/$OWNER/.pm2" \
    PATH="/usr/local/bin:/usr/bin:/bin" \
    /usr/bin/bash -c 'cd "$1" && exec pm2 start ecosystem.config.cjs --only wickedhome --update-env' bash "$ROOT"
}

healthy() {
  # Existing WickedHome API exposes GET /api/health -> {"ok":true}.
  curl --silent --show-error --fail --max-time 3 http://127.0.0.1:3100/api/health \
    | grep -q '"ok":true'
}

wait_healthy() {
  for i in $(seq 1 30); do
    if healthy; then return 0; fi
    sleep 2
  done
  return 1
}

CURRENT="$(readlink -f "$ROOT")"
case "$CURRENT" in "$RELEASES"/*) ;; *)
  echo "Current release $CURRENT is outside $RELEASES" >&2; exit 1;;
esac
STAGE="$RELEASES/$SHA"
[[ ! -e "$STAGE" ]] || { echo "Release already present: $STAGE" >&2; exit 1; }

# Deploy key stays with wicked, never the Actions runner.
runuser -u "$OWNER" -- /usr/bin/env \
  GIT_SSH_COMMAND="ssh -i /home/wicked/.ssh/wickedhome-ci-deploy -o IdentitiesOnly=yes" \
  git clone --quiet --depth 1 --branch main "$REPO" "$STAGE"
ACTUAL="$(runuser -u "$OWNER" -- git -C "$STAGE" rev-parse HEAD)"
if [[ "$ACTUAL" != "$SHA" ]]; then
  echo "main advanced or commit mismatch ($ACTUAL instead of $SHA)" >&2
  rm -rf -- "$STAGE"
  exit 1
fi

ln -s "$SHARED/.env" "$STAGE/.env"
# Only needed when STORAGE_DIR is relative (e.g. data/files). Prefer absolute
# STORAGE_DIR=/var/www/wickedhome-data/files in the private production .env.
if [[ -d "$SHARED/data" ]]; then ln -s "$SHARED/data" "$STAGE/data"; fi

echo "Installing/building WickedHome $SHA"
runuser -u "$OWNER" -- /usr/bin/bash -c '
  set -Eeuo pipefail
  cd "$1"
  npm ci --no-audit --no-fund
  npx prisma validate
  npm run build
' bash "$STAGE"

# DB migrations are forward-only. Backup before enabling continuous deployment.
runuser -u "$OWNER" -- /usr/bin/bash -c '
  set -Eeuo pipefail
  cd "$1"
  npx prisma migrate deploy
' bash "$STAGE"

echo "Activating WickedHome $SHA"
activate "$STAGE"
if ! restart_wickedhome_only || ! wait_healthy; then
  echo "Failed to activate $SHA; rolling back app release" >&2
  activate "$CURRENT"
  if restart_wickedhome_only && wait_healthy; then
    pm2_cmd save
    echo "App restored. Database migrations remain applied!" >&2
  else
    echo "URGENT: PM2 rollback failed; inspect wickedhome logs." >&2
  fi
  exit 1
fi

pm2_cmd save
echo "WickedHome deployed $SHA; other PM2 services untouched"
