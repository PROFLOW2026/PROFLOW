import type { OrgContext } from '@/shared/auth/context';
import {
  upsertOcrCorrectionMemory,
  vendorIdentifierSourceKey,
  vendorNameSourceKey,
} from '../data/correction-memory.repository';

/**
 * Remember confirmed mappings after a human confirm.
 * Never posts Actual. Failures are ignored so confirm cannot fail closed on memory.
 */
export async function rememberOcrCorrections(
  context: OrgContext,
  input: {
    vendorName?: string | null;
    companyNumber?: string | null;
    vatId?: string | null;
    currency?: string | null;
    vendorId?: string | null;
    projectId?: string | null;
    purchaseOrderId?: string | null;
    subcontractAgreementId?: string | null;
  },
): Promise<void> {
  if (!context.db || typeof (context.db as { insert?: unknown }).insert !== 'function') return;
  try {
    if (input.vendorId) {
      const nameKey = vendorNameSourceKey(input.vendorName);
      if (nameKey) {
        await upsertOcrCorrectionMemory(context.db, {
          organizationId: context.organizationId,
          mappingKind: 'vendor',
          sourceKey: nameKey,
          sourceVendorName: input.vendorName,
          vendorId: input.vendorId,
          userId: context.userId,
        });
      }
      const idKey =
        vendorIdentifierSourceKey(input.companyNumber) ?? vendorIdentifierSourceKey(input.vatId);
      if (idKey) {
        await upsertOcrCorrectionMemory(context.db, {
          organizationId: context.organizationId,
          mappingKind: 'vendor',
          sourceKey: idKey,
          sourceIdentifier: input.companyNumber ?? input.vatId,
          vendorId: input.vendorId,
          userId: context.userId,
        });
      }
    }
    if (input.vendorId && input.projectId) {
      await upsertOcrCorrectionMemory(context.db, {
        organizationId: context.organizationId,
        mappingKind: 'project',
        sourceKey: `vendor:${input.vendorId}`,
        sourceCurrency: input.currency,
        vendorId: input.vendorId,
        projectId: input.projectId,
        userId: context.userId,
      });
    }
    if (input.purchaseOrderId && input.vendorId) {
      await upsertOcrCorrectionMemory(context.db, {
        organizationId: context.organizationId,
        mappingKind: 'purchase_order',
        sourceKey: `vendor:${input.vendorId}:po`,
        vendorId: input.vendorId,
        projectId: input.projectId ?? null,
        purchaseOrderId: input.purchaseOrderId,
        userId: context.userId,
      });
    }
    if (input.subcontractAgreementId && input.vendorId && input.projectId) {
      await upsertOcrCorrectionMemory(context.db, {
        organizationId: context.organizationId,
        mappingKind: 'subcontract_agreement',
        sourceKey: `vendor:${input.vendorId}:project:${input.projectId}`,
        vendorId: input.vendorId,
        projectId: input.projectId,
        subcontractAgreementId: input.subcontractAgreementId,
        userId: context.userId,
      });
    }
  } catch {
    // Memory is advisory. Confirm must still succeed.
  }
}
