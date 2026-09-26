import { and, desc, eq, isNull } from 'drizzle-orm';
import { billingRecords } from '@drizzle/schema';
import { getBillingRecord } from '@/modules/billing';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  createExternalDocument,
  findExternalDocument,
  listExternalDocuments,
  updateExternalDocument,
} from '../data/external-documents';
import {
  assertIssuanceEligible,
  findReusableRejectedDocument,
} from '../domain/assert-issuance-eligible';
import {
  selectCreditNoteForStatutoryCredit,
  statutoryCreditOriginalStatusPatch,
} from '../domain/credit-note-link';
import { buildStatutoryIdempotencyKey } from '../domain/idempotency-key';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { SUMIT_PROVIDER_ID, type ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import { SumitAmbiguousCreateError } from '../providers/sumit/sumit-statutory-provider';
import {
  cancelExternalDocumentSchema,
  creditExternalDocumentSchema,
  type CancelExternalDocumentInput,
  type CreditExternalDocumentInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';
import { runCommittedOrgPhase } from './request-external-document';

/**
 * Credit where the provider supports it. Does not rewrite BillingRecord totals —
 * callers may create an internal credit_note billing record separately.
 */
export async function creditExternalStatutoryDocument(
  context: OrgContext,
  rawInput: CreditExternalDocumentInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<{
  readonly original: ExternalStatutoryDocument;
  readonly credit: ExternalStatutoryDocument;
}> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);

  const input = creditExternalDocumentSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to credit',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  if (provider.id === SUMIT_PROVIDER_ID) {
    return issueSumitCreditLinkedToBillingCreditNote(context, existing, input, provider);
  }

  const result = await provider.creditDocument({
    organizationId: context.organizationId,
    externalId: existing.externalId,
    reason: input.reason ?? null,
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.ok) {
    if (result.errorCode === 'unsupported') {
      throw new DomainRuleError(
        result.message,
        'invoicingIntegration.errors.creditUnsupported',
        { errorCode: result.errorCode },
      );
    }
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  const original = (await updateExternalDocument(context, existing.id, {
    status: 'credited',
  }))!;

  const credit = await createExternalDocument(context, {
    billingRecordId: existing.billingRecordId,
    providerId: provider.id,
    kind: 'credit_note',
    status: result.value.status === 'credited' ? 'credited' : 'pending',
    externalId: result.value.creditExternalId,
    externalNumber: result.value.creditExternalNumber,
    externalUrl: result.value.externalUrl,
  });

  return { original, credit };
}

export async function cancelExternalStatutoryDocument(
  context: OrgContext,
  rawInput: CancelExternalDocumentInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);

  const input = cancelExternalDocumentSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to cancel',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  let result: Awaited<ReturnType<StatutoryInvoicingProvider['cancelDocument']>>;
  try {
    result = await provider.cancelDocument({
      organizationId: context.organizationId,
      externalId: existing.externalId,
      reason: input.reason ?? null,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof SumitAmbiguousCreateError) {
      await updateExternalDocument(context, existing.id, {
        issuanceOutcome: 'ambiguous',
        lastErrorMessage: error.message,
      });
      throw new DomainRuleError(error.message, 'invoicingIntegration.errors.ambiguousIssuance', {
        externalDocumentId: existing.id,
      });
    }
    throw error;
  }

  if (!result.ok) {
    if (result.errorCode === 'unsupported') {
      throw new DomainRuleError(
        result.message,
        'invoicingIntegration.errors.cancelUnsupported',
        { errorCode: result.errorCode },
      );
    }
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  return (await updateExternalDocument(context, existing.id, {
    status: result.value.status === 'cancelled' ? 'cancelled' : 'pending',
  }))!;
}

async function listFinalizedCreditNoteIds(
  context: OrgContext,
  originalBillingRecordId: string,
): Promise<string[]> {
  const rows = await context.db
    .select({ id: billingRecords.id })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, context.organizationId),
        eq(billingRecords.voidsBillingRecordId, originalBillingRecordId),
        eq(billingRecords.kind, 'credit_note'),
        eq(billingRecords.status, 'finalized'),
        isNull(billingRecords.archivedAt),
      ),
    )
    .orderBy(desc(billingRecords.createdAt));
  return rows.map((row) => row.id);
}

function withCustomerSnapshot(
  creditNote: BillingRecordDetail,
  original: BillingRecordDetail,
): BillingRecordDetail {
  if (creditNote.customerSnapshot?.name?.trim()) return creditNote;
  return { ...creditNote, customerSnapshot: original.customerSnapshot };
}

/**
 * SUMIT credit is a new CreditInvoice. The new external row hangs off the
 * internal credit note. The original tax invoice row only changes status.
 */
async function issueSumitCreditLinkedToBillingCreditNote(
  context: OrgContext,
  originalDocument: ExternalStatutoryDocument,
  input: CreditExternalDocumentInput,
  provider: StatutoryInvoicingProvider,
): Promise<{
  readonly original: ExternalStatutoryDocument;
  readonly credit: ExternalStatutoryDocument;
}> {
  const creditNoteIds = input.creditNoteBillingRecordId
    ? []
    : await listFinalizedCreditNoteIds(context, originalDocument.billingRecordId);
  const selected = selectCreditNoteForStatutoryCredit({
    explicitCreditNoteId: input.creditNoteBillingRecordId,
    creditNoteIds,
  });
  if (!selected.ok) {
    throw new DomainRuleError(
      selected.error === 'missing_credit_note'
        ? 'A billing credit note is required before SUMIT can issue a credit'
        : 'More than one billing credit note reverses this invoice',
      selected.error === 'missing_credit_note'
        ? 'invoicingIntegration.errors.creditNoteRequired'
        : 'invoicingIntegration.errors.creditNoteAmbiguous',
    );
  }

  const prepared = await runCommittedOrgPhase(
    context.userId,
    context.organizationId,
    async (phase) => {
      const creditNote = await getBillingRecord(phase, selected.creditNoteId);
      if (
        creditNote.kind !== 'credit_note' ||
        creditNote.status !== 'finalized' ||
        creditNote.voidsBillingRecordId !== originalDocument.billingRecordId
      ) {
        throw new DomainRuleError(
          'The billing credit note does not reverse this invoice',
          'invoicingIntegration.errors.creditNoteRequired',
        );
      }

      const originalBilling = await getBillingRecord(phase, originalDocument.billingRecordId);
      const idempotencyKey = buildStatutoryIdempotencyKey(creditNote.id, 'credit_note');
      const { bridge } = buildStatutoryBridgeFromBillingRecord(
        phase,
        withCustomerSnapshot(creditNote, originalBilling),
        'credit_note',
      );

      const existingCredits = await listExternalDocuments(phase, creditNote.id);
      assertIssuanceEligible(existingCredits, 'credit_note');
      const reusable = findReusableRejectedDocument(existingCredits, 'credit_note');
      const row = reusable
        ? await updateExternalDocument(phase, reusable.id, {
            status: 'requested',
            issuanceOutcome: 'in_flight',
            reconciliationStatus: 'pending',
            reconciliationMetadata: null,
            externalId: null,
            externalNumber: null,
            externalUrl: null,
            pdf: null,
            issuedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            idempotencyKey,
          })
        : await createExternalDocument(phase, {
            billingRecordId: creditNote.id,
            providerId: provider.id,
            kind: 'credit_note',
            status: 'requested',
            issuanceOutcome: 'in_flight',
            idempotencyKey,
            reconciliationStatus: 'pending',
          });

      return { row: row!, bridge, idempotencyKey };
    },
  );

  let providerResult: Awaited<ReturnType<StatutoryInvoicingProvider['creditDocument']>>;
  try {
    providerResult = await provider.creditDocument({
      organizationId: context.organizationId,
      externalId: originalDocument.externalId!,
      reason: input.reason ?? null,
      idempotencyKey: prepared.idempotencyKey,
      billing: prepared.bridge,
    });
  } catch (error) {
    if (error instanceof SumitAmbiguousCreateError) {
      await runCommittedOrgPhase(context.userId, context.organizationId, async (phase) => {
        await updateExternalDocument(phase, prepared.row.id, {
          status: 'pending',
          issuanceOutcome: 'ambiguous',
          externalId: error.partialExternalId,
          lastErrorMessage: error.message,
        });
      });
      throw new DomainRuleError(error.message, 'invoicingIntegration.errors.ambiguousIssuance', {
        externalDocumentId: prepared.row.id,
      });
    }
    await runCommittedOrgPhase(context.userId, context.organizationId, async (phase) => {
      await updateExternalDocument(phase, prepared.row.id, {
        status: 'pending',
        issuanceOutcome: 'ambiguous',
        lastErrorMessage: error instanceof Error ? error.message : 'SUMIT credit failed',
      });
    });
    throw error;
  }

  if (!providerResult.ok) {
    await runCommittedOrgPhase(context.userId, context.organizationId, async (phase) => {
      await updateExternalDocument(phase, prepared.row.id, {
        status: 'cancelled',
        issuanceOutcome: 'confirmed_rejected',
        lastErrorCode: providerResult.errorCode,
        lastErrorMessage: providerResult.message,
      });
    });
    throw new DomainRuleError(
      providerResult.message,
      'invoicingIntegration.errors.providerFailed',
      { errorCode: providerResult.errorCode, externalDocumentId: prepared.row.id },
    );
  }

  return runCommittedOrgPhase(context.userId, context.organizationId, async (phase) => {
    const credit = (await updateExternalDocument(phase, prepared.row.id, {
      status: 'issued',
      issuanceOutcome: 'confirmed_created',
      externalId: providerResult.value.creditExternalId,
      externalNumber: providerResult.value.creditExternalNumber,
      externalUrl: providerResult.value.externalUrl,
      issuedAt: new Date().toISOString(),
      lastErrorCode: null,
      lastErrorMessage: null,
    }))!;

    const original = (await updateExternalDocument(
      phase,
      originalDocument.id,
      statutoryCreditOriginalStatusPatch(),
    ))!;

    return { original, credit };
  });
}
