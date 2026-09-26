import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord } from '../domain/types';
import { listCapturesForOrg } from '../data/quick-capture.repository';

export const INBOX_CAPTURE_STATUSES = ['ready_for_review', 'processing', 'failed'] as const;

export type CaptureInboxItem = CaptureItemRecord & {
  readonly inboxStatus: (typeof INBOX_CAPTURE_STATUSES)[number];
};

export async function listCaptureInbox(
  context: OrgContext,
  input: { readonly limit?: number; readonly offset?: number } = {},
): Promise<CaptureInboxItem[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const rows = await listCapturesForOrg(context.db, context.organizationId, {
    statuses: [...INBOX_CAPTURE_STATUSES],
    limit: input.limit,
    offset: input.offset,
  });

  return rows.map((row) => ({
    ...row,
    inboxStatus: row.status as CaptureInboxItem['inboxStatus'],
  }));
}
