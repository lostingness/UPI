// First-run / install state — port of InstallationManager's installed-state
// logic only (PHP requirements checks, .env writes and filesystem markers are
// NOT MIGRATABLE on Vercel). "Installed" = installation_guards.primary_admin
// row exists AND an admin user exists. The setup API (/api/setup) creates the
// first admin and the guard row; it refuses (409) once installed.
import { getSql, first, type Row } from "./db";
import { DatabaseNotConfigured } from "./errors";

/**
 * Distinguishes the three states callers need:
 * - true: installed (guard row + an admin user exist).
 * - false: NOT installed (guard/admin missing, or tables missing because
 *   migrations have not run yet — a query failure on absent tables is
 *   treated as "not installed", not as a crash).
 * - throws DatabaseNotConfigured (→ 503): the DB itself is unreachable /
 *   unconfigured. Callers must NOT collapse this into "not installed":
 *   /api/setup surfaces it as 503, so an operator can tell "database
 *   down" apart from "fresh install".
 */
export async function isInstalled(): Promise<boolean> {
  const sql = getSql(); // throws DatabaseNotConfigured when DATABASE_URL is absent
  try {
    const guard = first<Row>(await sql`SELECT user_id FROM installation_guards WHERE name = 'primary_admin'`);
    // Round 7 (L5) — FAIL CLOSED: a guard row means setup already ran. The
    // old code returned false when the guard existed but no admin row was
    // found, which re-opened POST /api/setup (a deleted / never-created
    // admin + a live guard = a second admin could be minted). A missing
    // admin with a live guard is an operator-recovery case
    // (scripts/create-admin.ts), never a re-install.
    if (guard) return true;
    const admin = first<Row>(await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    return Boolean(admin);
  } catch (e) {
    if (e instanceof DatabaseNotConfigured) throw e;
    return false; // e.g. tables do not exist yet → not installed
  }
}
