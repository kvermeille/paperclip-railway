// Creates Paperclip's first-admin ("bootstrap CEO") invite and prints its URL.
//
// This is the same transaction `paperclipai auth bootstrap-ceo` performs, done
// through Paperclip's own schema objects rather than raw SQL so it stays
// correct across upstream migrations. The CLI itself is not usable here: it
// refuses to run without an onboarding-written config.json, which a container
// configured purely from environment variables never has.
//
// Exit 0  = nothing left to do (invite printed, or the instance is claimed).
// Exit 1  = database or schema not ready; the caller retries.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createDb, instanceUserRoles, invites } from "@paperclipai/db";

const TAG = "paperclip-railway:";
const EXPIRES_HOURS = 72;

// Never call process.exit() here. Railway captures stdout through a pipe, which
// makes writes asynchronous, and exiting explicitly can truncate the very line
// this script exists to print. Set process.exitCode and let Node drain.
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`${TAG} DATABASE_URL is not set; skipping first-admin bootstrap.`);
    return 0;
  }

  const baseUrl = (process.env.PAPERCLIP_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const db = createDb(databaseUrl);
  const client = db.$client;

  try {
    // An instance admin means a human has already claimed this deployment.
    // Minting another invite then would be a way back in for whoever reads an
    // old deploy log, so stop.
    const admins = await db
      .select()
      .from(instanceUserRoles)
      .where(eq(instanceUserRoles.role, "instance_admin"));
    if (admins.length > 0) {
      console.log(`${TAG} instance already has an admin; no bootstrap invite created.`);
      return 0;
    }

    // Revoke any earlier unaccepted invite before issuing a new one. Only the
    // hash is stored, so a token printed to a previous deploy's log cannot be
    // recovered — reissuing on every boot is what keeps a usable URL in the log
    // the operator is actually looking at, and revoking keeps exactly one live.
    const now = new Date();
    await db
      .update(invites)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(invites.inviteType, "bootstrap_ceo"),
          isNull(invites.revokedAt),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, now),
        ),
      );

    const token = `pcp_bootstrap_${randomBytes(24).toString("hex")}`;
    const [created] = await db
      .insert(invites)
      .values({
        inviteType: "bootstrap_ceo",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        allowedJoinTypes: "human",
        expiresAt: new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000),
        invitedByUserId: "system",
      })
      .returning();

    console.log("");
    console.log(`${TAG} ================================================================`);
    console.log(`${TAG} FIRST ADMIN SETUP - open this to claim this Paperclip instance`);
    console.log(`${TAG} ${baseUrl}/invite/${token}`);
    console.log(`${TAG} expires ${created.expiresAt.toISOString()}`);
    console.log(`${TAG} A new link is issued on every deploy until someone claims it.`);
    console.log(`${TAG} ================================================================`);
    console.log("");
    return 0;
  } catch (err) {
    // Almost always `relation "invites" does not exist` on a fresh database,
    // i.e. the server has not finished migrating yet. The caller retries.
    console.error(`${TAG} first-admin bootstrap not ready yet (${err?.message ?? err})`);
    return 1;
  } finally {
    try {
      await client?.end?.({ timeout: 5 });
    } catch {
      // best effort
    }
  }
}

process.exitCode = await main();
