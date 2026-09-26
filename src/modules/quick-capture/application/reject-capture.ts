import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord, CaptureStatus } from '../domain/types';
import { findCaptureById, updateCaptureItem } from '../data/quick-capture.repository';

export type RejectCaptureInput = {
  readonly captureId: string;
  readonly mode: 'reject' | 'archive';
  readonly reason?: string | null;
};

export async function rejectCapture(
  context: OrgContext,
  input: RejectCaptureInput,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');

  const status: CaptureStatus = input.mode === 'archive' ? 'archived' : 'rejected';
  const patch =
    input.mode === 'archive'
      ? { status, archivedAt: new Date(), rejectedAt: null }
      : { status, rejectedAt: new Date(), archivedAt: null };

  const updated = await updateCaptureItem(context.db, context.organizationId, capture.id, patch);
  if (!updated) throw new NotFoundError('Quick capture');

  await recordAuditEvent(context, {
    action: input.mode === 'archive' ? AUDIT_ACTIONS.REJECTED : AUDIT_ACTIONS.REJECTED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: { mode: input.mode, reason: input.reason ?? null },
  });

  return updated;
}
