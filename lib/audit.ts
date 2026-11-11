// AdminAuditLog — append-only. actor_admin_id is snapshotted from admin_id at
// creation (survives admin deletion; admin_id FK is ON DELETE SET NULL).
import type { Sql } from "./db";

export async function auditLog(sql: Sql, adminId: number | null, action: string, subjectType: string | null, subjectId: number | null, meta: Record<string, unknown>, ip: string | null): Promise<void> {
  await sql`INSERT INTO admin_audit_logs (admin_id, actor_admin_id, action, subject_type, subject_id, meta, ip)
    VALUES (${adminId}, ${adminId}, ${action}, ${subjectType}, ${subjectId}, ${JSON.stringify(meta)}::jsonb, ${ip})`;
}
