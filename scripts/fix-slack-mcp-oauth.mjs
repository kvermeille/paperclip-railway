import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Slack's MCP server uses user OAuth, unlike the separate Slack bot install.
// https://github.com/paperclipai/paperclip/pull/13954
const catalogPath = process.argv[2] ?? "/app/packages/shared/src/app-definitions/slack.json";
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
assert.equal(catalog.slug, "slack", "Expected Slack app definition");
const method = catalog.methods.find((entry) => entry.key === "mcp-oauth");
assert.ok(method, "Upstream image has no Slack MCP OAuth method");
assert.equal(method.transport, "mcp_remote");
assert.equal(method.auth, "oauth");
assert.equal(method.defaults.serverUrl, "https://mcp.slack.com/mcp");

const expectedEndpoints = {
  authorizationEndpoint: [
    "https://slack.com/oauth/v2/authorize",
    "https://slack.com/oauth/v2_user/authorize",
  ],
  tokenEndpoint: [
    "https://slack.com/api/oauth.v2.access",
    "https://slack.com/api/oauth.v2.user.access",
  ],
};
for (const [key, [legacy, corrected]] of Object.entries(expectedEndpoints)) {
  assert.ok([legacy, corrected].includes(method.defaults[key]), `Unexpected upstream ${key}`);
  method.defaults[key] = corrected;
}
assert.ok(
  ["channels:read", "chat:write"].every((scope) => method.defaults.scopesHint.includes(scope)) &&
    method.defaults.scopesHint.length === 3 &&
    method.defaults.scopesHint.some((scope) => ["search:read", "search:read.public"].includes(scope)),
  "Upstream Slack scopes changed; review this patch before deploying",
);
method.defaults.scopesHint = ["channels:read", "chat:write", "search:read.public"];
method.guidanceMd = "Add channels:read, chat:write, and search:read.public under User Token Scopes in your Slack app. Register Paperclip's callback URL as a Redirect URL and enable Model Context Protocol under Features > Agents & AI Apps. Connect a Slack workspace and limit access to the channels agents need.";
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log("Applied Slack MCP user OAuth endpoints and public-search scopes.");
