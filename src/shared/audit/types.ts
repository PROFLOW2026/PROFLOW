/** Client-safe audit list DTOs - no Drizzle. */

export interface AuditEventSummary {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorEmail: string | null;
  readonly createdAt: Date;
}

export interface AuditListResult {
  readonly items: readonly AuditEventSummary[];
  readonly nextCursor: string | null;
}
