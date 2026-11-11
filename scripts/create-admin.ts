// Create (or update) an admin user. Usage:
//   DATABASE_URL=... npx tsx scripts/create-admin.ts admin@example.com "Admin Name"
// Password is read from ADMIN_PASSWORD env or prompted via stdin (never in argv).
// Mirrors Artisan app:create-admin (updateOrCreate by email, min 10 chars).
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question("Password (min 10 chars): ", (a) => { rl.close(); resolve(a); }));
}
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
  const [email, name] = process.argv.slice(2);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error("Usage: create-admin.ts <email> [name]"); process.exit(1); }
  const password = process.env.ADMIN_PASSWORD ?? (await promptPassword());
  if (password.length < 10) { console.error("Password must be at least 10 characters."); process.exit(1); }
  const sql = neon(url);
  const hash = await bcrypt.hash(password, 12);
  const rows = await sql`
    INSERT INTO users (name, email, password, role, is_active)
    VALUES (${name ?? "Admin"}, ${email.toLowerCase()}, ${hash}, 'admin', true)
    ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = 'admin', is_active = true
    RETURNING id, email, role`;
  const user = (rows as { id: number }[])[0];
  await sql`INSERT INTO installation_guards (name, user_id) VALUES ('primary_admin', ${user.id})
    ON CONFLICT (name) DO NOTHING`;
  console.log(`Admin ready: ${email} (id ${user.id})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
