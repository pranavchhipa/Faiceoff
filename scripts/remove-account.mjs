// Fully remove Faiceoff account(s) by email — auth login + all cascaded app data.
// For wiping test accounts so they can be recreated with the same email.
//
// Usage (from repo root):
//   node scripts/remove-account.mjs pranavchhipa01@gmail.com pranav@rectangled.io
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Order: delete public.users row first (cascades creators/brands → generations,
// collabs, licenses, ledgers, etc.), THEN delete the auth.users login.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase env."); process.exit(1); }

const s = createClient(url, key);
const emails = process.argv.slice(2);
if (emails.length === 0) { console.error("Pass one or more emails."); process.exit(1); }

async function count(table, col, val) {
  const { count } = await s.from(table).select("*", { count: "exact", head: true }).eq(col, val);
  return count ?? 0;
}

for (const email of emails) {
  console.log(`\n──────── ${email} ────────`);
  const { data: u } = await s.from("users").select("id, display_name, role").eq("email", email).maybeSingle();
  if (!u) { console.log("  no public.users row (already gone or never existed)."); }

  let creatorId = null, brandId = null;
  if (u) {
    const [{ data: c }, { data: b }] = await Promise.all([
      s.from("creators").select("id").eq("user_id", u.id).maybeSingle(),
      s.from("brands").select("id").eq("user_id", u.id).maybeSingle(),
    ]);
    creatorId = c?.id ?? null; brandId = b?.id ?? null;

    // Footprint (for transparency)
    const fp = {};
    if (creatorId) {
      fp.role = "creator";
      fp.generations = await count("generations", "creator_id", creatorId);
      fp.reference_photos = await count("creator_reference_photos", "creator_id", creatorId);
      fp.collab_requests = await count("collab_requests", "creator_id", creatorId);
      fp.collab_sessions = await count("collab_sessions", "creator_id", creatorId);
      fp.licenses = await count("licenses", "creator_id", creatorId);
    }
    if (brandId) {
      fp.role = fp.role ? fp.role + "+brand" : "brand";
      fp.brand_generations = await count("generations", "brand_id", brandId);
      fp.brand_collab_requests = await count("collab_requests", "brand_id", brandId);
      fp.brand_collab_sessions = await count("collab_sessions", "brand_id", brandId);
    }
    console.log("  footprint:", JSON.stringify(fp));

    // 1. Delete public.users (cascades creators/brands → all app data).
    const { error: delErr } = await s.from("users").delete().eq("id", u.id);
    if (delErr) { console.log("  ✗ public.users delete failed:", delErr.message); }
    else { console.log("  ✓ public.users + cascaded app data deleted"); }

    // 2. Delete the auth login so the email is free to re-register.
    const { error: authErr } = await s.auth.admin.deleteUser(u.id);
    if (authErr) { console.log("  ✗ auth user delete failed:", authErr.message); }
    else { console.log("  ✓ auth.users login deleted"); }
  } else {
    // No public row — still try to free the auth login if it exists.
    const { data: list } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const au = list?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (au) {
      const { error } = await s.auth.admin.deleteUser(au.id);
      console.log(error ? `  ✗ auth delete failed: ${error.message}` : "  ✓ auth.users login deleted");
    } else {
      console.log("  no auth user either — email is already free.");
    }
  }

  // Verify gone
  const { data: still } = await s.from("users").select("id").eq("email", email).maybeSingle();
  console.log(`  final: public.users ${still ? "STILL PRESENT ⚠" : "gone ✓"} — email ready to re-register`);
}
console.log("\nDone.");
