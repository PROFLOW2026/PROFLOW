import { getBillingRecord } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertBillingBridgeSameOrg,
  createExternalDocument,
  findExternalDocument,
  listExternalDocuments,
  updateExternalDocument,
} from '../data/external-documents';
import {
  assertIssuanceEligible,
  findReusableRejectedDocument,
} from '../domain/assert-issuance-eligible';
import type {
  CreateExternalDocumentInput,
  CreateExternalDocumentOutput,
  StatutoryInvoicingProvider,
  StatutoryProviderResult,
} from '../domain/provider';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import {
  assertBillingEligibleForExternalRequest,
  assertBillingIsNotStatutoryIssuer,
  assertNotLocalStatutoryIssuance,
} from '../domain/separation';
import type { ExternalDocumentKind, ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import { SumitAmbiguousCreateError } from '../providers/sumit/sumit-statutory-provider';
import {
  requestExternalDocumentSchema,
  type RequestExternalDocumentInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabledForOrg } from './assert-feature-enabled';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';

/**
 * Billing Record → user requests external statutory document → provider → store refs.
 * Does not change BillingRecord amounts; does not issue locally.
 *
 * Production server actions use {@link requestExternalStatutoryDocumentCommitted}
 * so the issuance lock and outcome survive UI errors (no request-bound rollback).
 */

type CommittedPhaseRunner = <T>(
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
) => Promise<T>;

let committedPhaseRunnerForTests: CommittedPhaseRunner | null = null;

export function setCommittedPhaseRunnerForTests(runner: CommittedPhaseRunner | null): void {
  committedPhaseRunnerForTests = runner;
}

export async function runCommittedOrgPhase<T>(
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  if (committedPhaseRunnerForTests) {
    return committedPhaseRunnerForTests(userId, organizationId, fn);
  }
  const { runInOrgContext } = await import('@/shared/auth/session');
  return runInOrgContext(userId, organizationId, fn);
}

async function resolveProvider(
  context: OrgContext,
  provider?: StatutoryInvoicingProvider,
): Promise<StatutoryInvoicingProvider> {
  if (provider) return provider;
  const fromOrg = await resolveStatutoryProviderForOrg(context);
  return fromOrg.isConfigured() ? fromOrg : getStatutoryInvoicingProvider();
}

async function prepareIssuanceLock(
  context: OrgContext,
  input: RequestExternalDocumentInput,
  resolvedProvider: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertBillingIsNotStatutoryIssuer();
  await assertStatutoryFeatureEnabledForOrg(context, resolvedProvider);
  assertNotLocalStatutoryIssuance(resolvedProvider.id);

  await assertBillingBridgeSameOrg(
    context,
    input.billing.billingRecordId,
    input.billing.organizationId,
  );
  assertBillingEligibleForExternalRequest(input.billing);

  const existing = await listExternalDocuments(context, input.billing.billingRecordId);
  assertIssuanceEligible(existing, input.kind);

  const reusable = findReusableRejectedDocument(existing, input.kind);
  if (reusable) {
    const reopened = await updateExternalDocument(context, reusable.id, {
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
    });
    return reopened!;
  }

  const documentKind = input.kind ?? 'tax_invoice';

  return createExternalDocument(context, {
    billingRecordId: input.billing.billingRecordId,
    providerId: resolvedProvider.id,
    kind: documentKind,
    status: 'requested',
    issuanceOutcome: 'in_flight',
    idempotencyKey: input.idempotencyKey,
    reconciliationStatus: 'pending',
  });
}

async function persistConfirmedRejected(
  context: OrgContext,
  rowId: string,
  errorCode: string,
  message: string,
): Promise<ExternalStatutoryDocument> {
  const updated = await updateExternalDocument(context, rowId, {
    status: 'cancelled',
    issuanceOutcome: 'confirmed_rejected',
    lastErrorCode: errorCode,
    lastErrorMessage: message,
    reconciliationStatus: 'not_available',
  });
  return updated!;
}

async function persistAmbiguousOutcome(
  context: OrgContext,
  rowId: string,
  message: string,
  partialExternalId: string | null = null,
): Promise<ExternalStatutoryDocument> {
  const updated = await updateExternalDocument(context, rowId, {
    status: 'pending',
    issuanceOutcome: 'ambiguous',
    externalId: partialExternalId,
    lastErrorMessage: message,
    reconciliationStatus: 'pending',
  });
  return updated!;
}

async function persistConfirmedCreated(
  context: OrgContext,
  rowId: string,
  input: RequestExternalDocumentInput,
  value: CreateExternalDocumentOutput,
): Promise<ExternalStatutoryDocument> {
  const reconciliation = reconcileExternalAmounts(
    input.billing,
    value.providerAmounts ?? null,
  );

  const updated = await updateExternalDocument(context, rowId, {
    status: value.status === 'issued' ? 'issued' : 'pending',
    issuanceOutcome: 'confirmed_created',
    externalId: value.externalId,
    externalNumber: value.externalNumber,
    externalUrl: value.externalUrl,
    pdf: value.pdf,
    issuedAt: value.issuedAt,
    reconciliationStatus: reconciliation.status,
    reconciliationMetadata: reconciliation.metadata,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  return updated!;
}

function throwProviderRejected(
  result: Extract<StatutoryProviderResult<CreateExternalDocumentOutput>, { ok: false }>,
  externalDocumentId: string,
): never {
  if (result.errorCode === 'not_configured') {
    throw new DomainRuleError(
      result.message,
      'invoicingIntegration.errors.connectionRequired',
      { errorCode: result.errorCode },
    );
  }
  throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
    errorCode: result.errorCode,
    externalDocumentId,
  });
}

async function executeProviderCreateAndPersistOutcome(
  userId: string,
  organizationId: string,
  rowId: string,
  input: RequestExternalDocumentInput,
  provider: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  const documentKind = input.kind ?? 'tax_invoice';
  const createInput: CreateExternalDocumentInput = {
    organizationId,
    billing: input.billing,
    kind: documentKind,
    idempotencyKey: input.idempotencyKey,
  };

  let result: StatutoryProviderResult<CreateExternalDocumentOutput>;
  try {
    result = await provider.createDocument(createInput);
  } catch (error) {
    if (error instanceof SumitAmbiguousCreateError) {
      const ambiguous = await runCommittedOrgPhase(userId, organizationId, async (context) =>
        persistAmbiguousOutcome(context, rowId, error.message, error.partialExternalId),
      );
      throw new DomainRuleError(
        error.message,
        'invoicingIntegration.errors.ambiguousIssuance',
        { externalDocumentId: ambiguous.id },
      );
    }

    await runCommittedOrgPhase(userId, organizationId, async (context) =>
      persistAmbiguousOutcome(
        context,
        rowId,
        error instanceof Error ? error.message : 'Unknown provider error',
      ),
    );
    throw error;
  }

  if (!result.ok) {
    const rejected = await runCommittedOrgPhase(userId, organizationId, async (context) =>
      persistConfirmedRejected(context, rowId, result.errorCode, result.message),
    );
    throwProviderRejected(result, rejected.id);
  }

  return runCommittedOrgPhase(userId, organizationId, async (context) =>
    persistConfirmedCreated(context, rowId, input, result.value),
  );
}

/**
 * Durable issuance path for server actions: lock and outcome each commit independently.
 */
export async function requestExternalStatutoryDocumentCommitted(
  userId: string,
  organizationId: string,
  billingRecordId: string,
  kind: ExternalDocumentKind = 'tax_invoice',
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  const prepared = await runCommittedOrgPhase(userId, organizationId, async (context) => {
    const billing = await getBillingRecord(context, billingRecordId);
    const { bridge, idempotencyKey } = buildStatutoryBridgeFromBillingRecord(context, billing, kind);
    const input = requestExternalDocumentSchema.parse({
      billing: bridge,
      kind,
      idempotencyKey,
    });
    const resolvedProvider = await resolveProvider(context, provider);
    const row = await prepareIssuanceLock(context, input, resolvedProvider);
    return { row, input, resolvedProvider };
  });

  return executeProviderCreateAndPersistOutcome(
    userId,
    organizationId,
    prepared.row.id,
    prepared.input,
    prepared.resolvedProvider,
  );
}

/**
 * Single-context path for unit tests and in-process callers.
 * Production UI must use {@link requestExternalStatutoryDocumentCommitted}.
 */
export async function requestExternalStatutoryDocument(
  context: OrgContext,
  rawInput: RequestExternalDocumentInput,
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  const input = requestExternalDocumentSchema.parse(rawInput);
  const resolvedProvider = await resolveProvider(context, provider);
  const row = await prepareIssuanceLock(context, input, resolvedProvider);

  const documentKind = input.kind ?? 'tax_invoice';
  const createInput: CreateExternalDocumentInput = {
    organizationId: context.organizationId,
    billing: input.billing,
    kind: documentKind,
    idempotencyKey: input.idempotencyKey,
  };

  try {
    const result = await resolvedProvider.createDocument(createInput);

    if (!result.ok) {
      const failed = await persistConfirmedRejected(
        context,
        row.id,
        result.errorCode,
        result.message,
      );
      throwProviderRejected(result, failed.id);
    }

    return persistConfirmedCreated(context, row.id, input, result.value);
  } catch (error) {
    if (error instanceof DomainRuleError) {
      const current = await findExternalDocument(context, row.id);
      if (
        current?.issuanceOutcome === 'confirmed_rejected' ||
        current?.issuanceOutcome === 'confirmed_created' ||
        current?.issuanceOutcome === 'ambiguous'
      ) {
        throw error;
      }
    }

    if (error instanceof SumitAmbiguousCreateError) {
      const ambiguous = await persistAmbiguousOutcome(
        context,
        row.id,
        error.message,
        error.partialExternalId,
      );
      throw new DomainRuleError(
        error.message,
        'invoicingIntegration.errors.ambiguousIssuance',
        { externalDocumentId: ambiguous.id },
      );
    }

    const current = await findExternalDocument(context, row.id);
    if (
      current?.issuanceOutcome === 'confirmed_rejected' ||
      current?.issuanceOutcome === 'confirmed_created' ||
      current?.issuanceOutcome === 'ambiguous'
    ) {
      throw error;
    }

    await persistAmbiguousOutcome(
      context,
      row.id,
      error instanceof Error ? error.message : 'Unknown provider error',
    );
    throw error;
  }
}
