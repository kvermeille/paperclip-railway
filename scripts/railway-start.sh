#!/bin/sh
# Boot wrapper for Paperclip on Railway. Runs as the image's own `node` user:
# the upstream entrypoint has already chowned $PAPERCLIP_HOME and dropped
# privileges by the time this executes.
set -e

cd /app

# RAILWAY_PUBLIC_DOMAIN carries the host only, never the scheme, and
# `authenticated + public` refuses to start without an explicit public URL.
# Defaulting it here keeps the template from needing a variable the deployer
# cannot know before the domain exists.
if [ -z "${PAPERCLIP_PUBLIC_URL:-}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  PAPERCLIP_PUBLIC_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
  export PAPERCLIP_PUBLIC_URL
fi

# Mint the first-admin invite in the background. It has to wait for the server
# to apply migrations, because the `invites` table does not exist on a fresh
# database. The loop is bounded so a genuinely broken database surfaces as a
# failed health check rather than a process that retries forever.
bootstrap_invite() {
  i=0
  while [ "$i" -lt 60 ]; do
    i=$((i + 1))
    sleep 5
    if node --import ./server/node_modules/tsx/dist/loader.mjs \
        ./server/railway-bootstrap-ceo-invite.mjs; then
      return 0
    fi
  done
  echo "paperclip-railway: gave up waiting for the schema; no bootstrap invite was created." >&2
  echo "paperclip-railway: redeploy this service to retry." >&2
  return 0
}
bootstrap_invite &

# Restate the image's own CMD. Keep this in step with upstream's Dockerfile.
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
