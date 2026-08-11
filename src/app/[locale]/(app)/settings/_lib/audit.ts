import { listAuditEventSummaries } from '@/shared/audit';
import type { AuditEventSummary, AuditListResult } from '@/shared/audit/types';
import type { OrgContext } from '@/shared/auth/context';

export type { AuditEventSummary, AuditListResult };

const PAGE_SIZE = 25;

export async function listAuditEvents(
  context: OrgContext,
  options: { cursor?: string | null } = {},
): Promise<AuditListResult> {
  return listAuditEventSummaries(context, { cursor: options.cursor, limit: PAGE_SIZE });
}
