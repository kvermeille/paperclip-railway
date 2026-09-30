# Paperclip on Railway

Deployment wrapper for [Paperclip](https://github.com/paperclipai/paperclip),
the open-source control plane for managing teams of AI agents at work.

It builds on upstream's published image, `ghcr.io/paperclipai/paperclip:latest`,
and adds one thing that image cannot do on its own: create the first instance
admin without a shell.

## Why a wrapper is needed

Paperclip runs internet-facing deployments in `authenticated + public` mode,
which **deliberately disables** the browser "claim this instance" screen
(`doc/DEPLOYMENT-MODES.md` §8) — otherwise whoever found the URL first could
make themselves the owner. The supported alternative is a high-entropy
bootstrap-CEO invite, which upstream mints with
`paperclipai auth bootstrap-ceo`: a shell step that someone deploying from a
template does not have, and that the CLI refuses to perform anyway without an
onboarding-written `config.json` a container configured from environment
variables never has.

So `scripts/bootstrap-ceo-invite.mjs` performs that same transaction through
Paperclip's own schema objects (`@paperclipai/db`), and `railway-start.sh`
prints the resulting URL into the Railway deploy log — a log only the project's
own members can read. A fresh link is issued on every deploy until someone
claims the instance; after that the script does nothing.

## First run

1. Deploy, then open the service's **Deploy Logs**.
2. Find the `FIRST ADMIN SETUP` banner and open the URL on it.
3. Create your account. That account becomes the instance admin.
4. Optional hardening once you are in: set `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`
   so no one else can register. Leave it unset until you have claimed the
   instance — it gates the same endpoint your own signup goes through.

## Slack MCP connection fix

This fork applies the endpoint and scope correction from
[upstream PR #13954](https://github.com/paperclipai/paperclip/pull/13954) at
image-build time. Only the Slack `mcp-oauth` method is changed. The Dockerfile
pins the base image used by the existing Railway deployment, so this fix does
not also upgrade Paperclip.

In your Slack app, add `channels:read`, `chat:write`, and `search:read.public`
under **User Token Scopes**, register Paperclip's callback URL, and enable
**Model Context Protocol** under **Features > Agents & AI Apps**. After
deploying this image, create a new Slack connection: old incomplete drafts
retain their original OAuth configuration.

The patch fails the image build if upstream changes the expected catalog
structure. Once the upstream image includes the fix, remove the patch and
deliberately update the pinned image digest.

## Notes for maintainers

- **Never set a Railway start command on this service.** A start command
  replaces the image `ENTRYPOINT`, and upstream's entrypoint is what chowns the
  volume at `/paperclip` and drops root to the `node` user. Only `CMD` is
  overridden here.
- The `CMD` in `Dockerfile` restates upstream's own command. If upstream changes
  it, change it here too.
- `PAPERCLIP_PUBLIC_URL` defaults to `https://$RAILWAY_PUBLIC_DOMAIN` in
  `railway-start.sh`, so the template needs no host variable.
