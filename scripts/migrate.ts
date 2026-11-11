// Applies db/migrations/*.sql in order against DATABASE_URL (Neon).
// Records applied versions in schema_migrations; skips recorded ones.
// Usage: DATABASE_URL=... npm run migrate   (or put DATABASE_URL in .env.local)
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "db", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
  const sql = neon(url);
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((r) => (r as { version: string }).version));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (applied.has(f)) { console.log(`skip ${f} (already applied)`); continue; }
    const text = readFileSync(join(dir, f), "utf8");
    // Neon HTTP driver: run the whole file as one query where possible; split
    // on statement boundaries only if the driver rejects multi-statement SQL.
    try {
      await sql.query(text, []);
    } catch (e) {
      // Fallback: split on semicolons at line ends.
      for (const stmt of text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        await sql.query(stmt, []);
      }
      void e;
    }
    await sql`INSERT INTO schema_migrations (version) VALUES (${f}) ON CONFLICT DO NOTHING`;
    console.log(`applied ${f}`);
  }
  console.log("migrations done");
}
main().catch((e) => { console.error(e); process.exit(1); });
