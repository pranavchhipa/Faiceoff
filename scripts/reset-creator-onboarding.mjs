// Reset ONE creator account back to the start of the onboarding wizard,
// wiping all wizard-collected data — but PRESERVING the generated images
// (generations / collab_sessions / approvals / licenses) for later review.
//
// Scoped hard to a single creatorId. Generations are never touched.
import pg from "pg";
import fs from "fs";
import path from "path";
import dns from "dns";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
dns.setDefaultResultOrder("ipv4first");

const USER_ID = "92ccd964-39ba-4a40-ac24-367a113a07a0";
const CREATOR_ID = "31606e67-d672-416f-bc13-3fd9699282a5";
const EMAIL = "pranavchhipa01@gmail.com";

const client = new pg.Client({
  host: "aws-1-ap-south-1.pooler.supabase.com",
  port: 5432, database: "postgres",
  user: "postgres.jgmhronskdnzqkkimffp",
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

// Leaf child tables holding wizard-collected data — safe to delete.
const WIPE_TABLES = [
  "creator_categories",
  "creator_compliance_vectors",
  "creator_reference_photos",
  "creator_kyc",
  "creator_blocked_categories",
  "creator_packages",
  "creator_bank_accounts",
  "creator_demo_samples",
  "creator_lora_models",
];

async function tryQuery(sql, params) {
  try { return await client.query(sql, params); }
  catch (e) { return { __error: e.message }; }
}

async function main() {
  await client.connect();

  // Safety: re-confirm the target is THIS account before doing anything.
  const guard = await client.query(
    "select id from public.creators where id = $1 and user_id = $2",
    [CREATOR_ID, USER_ID],
  );
  if (guard.rowCount !== 1) {
    console.error("ABORT: creator/user id mismatch. No changes made.");
    await client.end();
    process.exit(1);
  }

  // Count generations BEFORE so we can prove they were untouched.
  const gensBefore = (await client.query(
    "select count(*)::int n from public.generations where creator_id = $1", [CREATOR_ID],
  )).rows[0].n;

  console.log(`Target: ${EMAIL}  creator=${CREATOR_ID}`);
  console.log(`Generations before: ${gensBefore} (these will NOT be touched)\n`);

  await client.query("BEGIN");
  try {
    // 1. Delete wizard child rows
    for (const t of WIPE_TABLES) {
      const r = await tryQuery(`delete from public.${t} where creator_id = $1`, [CREATOR_ID]);
      if (r.__error) console.log(`  skip ${t}: ${r.__error.slice(0, 60)}`);
      else console.log(`  wiped ${t}: ${r.rowCount} row(s)`);
    }

    // 2. Reset the creators row to a fresh, pre-onboarding state.
    const upd = await client.query(
      `update public.creators set
         onboarding_step = 'identity',
         kyc_status = 'not_started',
         kyc_document_url = null,
         instagram_handle = null,
         instagram_followers = null,
         instagram_user_id = null,
         instagram_access_token = null,
         youtube_handle = null,
         youtube_subscribers = null,
         tiktok_handle = null,
         bio = null,
         gender = null,
         dpdp_consent_version = null,
         dpdp_consent_at = null,
         face_anchor_pack = null,
         face_anchor_generated_at = null,
         cover_image_path = null,
         is_active = false,
         is_live = false,
         updated_at = now()
       where id = $1`,
      [CREATOR_ID],
    );
    console.log(`  reset creators row: ${upd.rowCount}`);

    // 3. Verify generations untouched, then commit.
    const gensAfter = (await client.query(
      "select count(*)::int n from public.generations where creator_id = $1", [CREATOR_ID],
    )).rows[0].n;
    if (gensAfter !== gensBefore) {
      throw new Error(`Generation count changed (${gensBefore} -> ${gensAfter}); rolling back.`);
    }

    await client.query("COMMIT");
    console.log(`\nCOMMIT ok. Generations after: ${gensAfter} (unchanged).`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLBACK:", e.message);
    await client.end();
    process.exit(1);
  }

  // Final state snapshot
  const after = (await client.query(
    "select onboarding_step, kyc_status, is_active, is_live, instagram_handle from public.creators where id = $1",
    [CREATOR_ID],
  )).rows[0];
  console.log("\nCreator now:", JSON.stringify(after));
  console.log("Preserved: generations / collab_sessions / approvals / licenses untouched.");
  console.log("Login is intact — log in and you'll land on onboarding step 1 (identity).");

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
