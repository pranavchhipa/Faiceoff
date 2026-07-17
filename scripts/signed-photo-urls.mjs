// Print 1-hour signed URLs for a creator's reference photos (private bucket).
//
// Usage (from repo root):
//   node scripts/signed-photo-urls.mjs gunjandhawan235@gmail.com
//   node scripts/signed-photo-urls.mjs                # all creators with photos
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// The private `reference-photos` bucket needs the service-role key to sign.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── tiny .env.local loader (no dotenv dependency) ──
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* env may already be set in the shell */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}

const supabase = createClient(url, key);
const emailFilter = process.argv[2] || null;
const BUCKET = "reference-photos";
const TTL = Number(process.env.TTL_SECONDS) || 86400; // default 24h; override with TTL_SECONDS

// Join reference photos → creators → users to get email + path.
let q = supabase
  .from("creator_reference_photos")
  .select("storage_path, is_primary, creators!inner(users!inner(display_name, email))")
  .order("is_primary", { ascending: false });

const { data, error } = await q;
if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const rows = (data ?? [])
  .map((r) => ({
    path: r.storage_path,
    primary: r.is_primary,
    name: r.creators?.users?.display_name ?? "?",
    email: r.creators?.users?.email ?? "?",
  }))
  .filter((r) => !emailFilter || r.email.toLowerCase() === emailFilter.toLowerCase());

if (rows.length === 0) {
  console.log(emailFilter ? `No reference photos for ${emailFilter}` : "No reference photos found.");
  process.exit(0);
}

const paths = rows.map((r) => r.path);
const { data: signed, error: signErr } = await supabase.storage
  .from(BUCKET)
  .createSignedUrls(paths, TTL);
if (signErr) {
  console.error("Sign failed:", signErr.message);
  process.exit(1);
}

const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
let last = "";
for (const r of rows) {
  if (r.email !== last) {
    console.log(`\n=== ${r.name} <${r.email}> ===`);
    last = r.email;
  }
  console.log(`${r.primary ? "[PRIMARY]" : "         "} ${byPath.get(r.path) ?? "(no url)"}`);
}
console.log(`\n(${rows.length} photos · links valid ${Math.round(TTL / 3600)}h)`);

// ── Always write a self-opening HTML gallery so you never copy a giant URL ──
const groups = new Map();
for (const r of rows) {
  const k = `${r.name} <${r.email}>`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push({ url: byPath.get(r.path), primary: r.primary });
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let html = `<!doctype html><meta charset="utf8"><title>Reference photos</title>
<style>body{background:#0e0f13;color:#eee;font-family:system-ui;margin:0;padding:24px}
h2{font-size:15px;margin:28px 0 12px;color:#c9a96e}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.card{background:#191b20;border:1px solid #2a2d34;border-radius:10px;overflow:hidden}
img{width:100%;height:220px;object-fit:cover;display:block}
.tag{font-size:10px;padding:4px 8px;color:#9a9;letter-spacing:.1em}</style>
<h1 style="font-size:18px">Creator reference photos <span style="color:#777;font-size:12px">(${rows.length} · valid ${Math.round(TTL / 3600)}h)</span></h1>`;
for (const [k, imgs] of groups) {
  html += `<h2>${esc(k)}</h2><div class="grid">`;
  for (const im of imgs) {
    html += `<div class="card"><img src="${im.url}" loading="lazy"><div class="tag">${im.primary ? "PRIMARY" : ""}</div></div>`;
  }
  html += `</div>`;
}
const { writeFileSync } = await import("node:fs");
const out = "reference-photos-gallery.html";
writeFileSync(out, html);
console.log(`\n→ Gallery written: ${out}  (open this file in your browser)`);
