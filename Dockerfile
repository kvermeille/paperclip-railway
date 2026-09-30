# Paperclip on Railway.
#
# Upstream publishes a complete image, so this repo adds exactly one thing the
# published image cannot do by itself: create the first instance admin.
#
# Paperclip's `authenticated + public` mode deliberately disables the browser
# "claim this instance" screen (doc/DEPLOYMENT-MODES.md §8) precisely so that a
# stranger who finds the URL cannot make themselves the owner. The only way in
# is a high-entropy bootstrap-CEO invite, which upstream creates with the
# `paperclipai auth bootstrap-ceo` CLI — a shell step a template deployer does
# not have. The wrapper below mints that invite at boot and prints it to the
# Railway deploy log, which only the project's own members can read.
# Keep the existing Railway deployment's base image while applying this fix.
FROM ghcr.io/paperclipai/paperclip@sha256:a02ac35ac41df911af477422ea0e781cf41d2b2c600c66f0a5ac9d8c63f52c2c

# The upstream ENTRYPOINT (docker-entrypoint.sh) still runs first, as root: it
# chowns $PAPERCLIP_HOME — which on Railway is a volume that arrives root-owned
# — and then `gosu node` execs this CMD. Only CMD is replaced here, so none of
# that is lost. For the same reason this service must never be given a Railway
# start command: a start command replaces the ENTRYPOINT, skipping the chown
# and the privilege drop.
USER root

# Patch only the Slack MCP catalog entry until upstream PR #13954 ships.
COPY scripts/fix-slack-mcp-oauth.mjs /tmp/fix-slack-mcp-oauth.mjs
RUN node /tmp/fix-slack-mcp-oauth.mjs \
  && rm /tmp/fix-slack-mcp-oauth.mjs

# Both files live under /app/server so that Node resolves `@paperclipai/db` and
# `drizzle-orm` through server/node_modules, the same way the server does.
COPY --chown=node:node scripts/railway-start.sh /app/server/railway-start.sh
COPY --chown=node:node scripts/bootstrap-ceo-invite.mjs /app/server/railway-bootstrap-ceo-invite.mjs
RUN chmod +x /app/server/railway-start.sh

CMD ["/app/server/railway-start.sh"]
