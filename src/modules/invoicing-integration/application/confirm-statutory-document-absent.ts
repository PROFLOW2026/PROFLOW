import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import type { ExternalStatutoryDocument, ReconciliationMetadata } from '../domain/types';
import { mergeAbsenceProofMetadata } from '../domain/sumit-absence-proof';
import {
  confirmStatutoryDocumentAbsentSchema,
  type ConfirmStatutoryDocumentAbsentInput,
} from '../validation/schemas';

export async function confirmStatutoryDocumentAbsent(
  context: OrgContext,
  rawInput: ConfirmStatutoryDocumentAbsentInput,
): Promise<ExternalStatutoryDocument> {
  if (!context.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    throw new AuthorizationError();
  }
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = confirmStatutoryDocumentAbsentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');

  if (existing.issuanceOutcome !== 'ambiguous') {
    throw new DomainRuleError(
      'Absence confirmation is only allowed for ambiguous documents',
      'invoicingIntegration.errors.invalidIssuanceState',
    );
  }

  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const confirmedAt = new Date().toISOString();
  const reconciliationMetadata = mergeAbsenceProofMetadata(priorMeta, {
    manualAbsenceConfirmedAt: confirmedAt,
  }) as unknown as ReconciliationMetadata;

  const updated = await updateExternalDocument(context, existing.id, {
    status: 'cancelled',
    issuanceOutcome: 'confirmed_rejected',
    lastErrorCode: 'confirmed_absent',
    lastErrorMessage: input.reason.trim(),
    reconciliationStatus: 'not_available',
    reconciliationMetadata,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.STATUTORY_DOCUMENT_ABSENCE_CONFIRMED,
    entityType: 'external_statutory_document',
    entityId: existing.id,
    metadata: {
      reason: input.reason.trim(),
      confirmedCheckedInSumit: input.confirmedCheckedInSumit,
    },
  });

  return updated!;
}
