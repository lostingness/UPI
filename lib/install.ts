// First-run / install state — port of InstallationManager's installed-state
// logic only (PHP requirements checks, .env writes and filesystem markers are
// NOT MIGRATABLE on Vercel). "Installed" = installation_guards.primary_admin
// row exists AND an admin user exists. The setup API (/api/setup) creates the
// first admin and the guard row; it refuses (409) once installed.
import { getSql, first, type Row } from "./db";

export async function isInstalled(): Promise<boolean> {
  try {
    const sql = getSql();
    const guard = first<Row>(await sql`SELECT user_id FROM installation_guards WHERE name = 'primary_admin'`);
    if (!guard) return false;
    const admin = first<Row>(await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    return Boolean(admin);
  } catch { return false; }
}
