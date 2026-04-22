import pg from "pg";
import fs from "fs";
import path from "path";
import dns from "dns";
import { fileURLToPath } from "url";

// Load .env.local so SUPABASE_DB_PASSWORD is available
const envPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".env.local"
);
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Force IPv4 — Supabase DB host resolves to IPv6 which may not route
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error(
    "ERROR: SUPABASE_DB_PASSWORD not set. Add it to .env.local and retry."
  );
  process.exit(1);
}

// Use Supabase connection pooler (session mode, port 5432) — direct DB host only has IPv6
// Pooler moved to aws-1-ap-south-1 (Mumbai) infrastructure on 2026-04-23
const client = new pg.Client({
  host: process.env.SUPABASE_POOLER_HOST || "aws-1-ap-south-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: process.env.SUPABASE_POOLER_USER || "postgres.jgmhronskdnzqkkimffp",
  password,
  ssl: { rejectUnauthorized: false },
});

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");

async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres");

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      id serial primary key,
      name text not null unique,
      applied_at timestamptz not null default now()
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await client.query(
    "SELECT name FROM public._migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`SKIP (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`RUNNING: ${file}`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO public._migrations (name) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`  OK: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAILED: ${file}`);
      console.error(`  Error: ${err.message}`);
      // Continue with next migration rather than stopping
    }
  }

  await client.end();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
