'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createCustomerGrant,
  createVendorGrant,
  previewCustomerPortalAccess,
  getVendorPortalPreview,
  recordVendorQuoteOnBehalf,
  revokeCustomerGrant,
  revokeVendorGrant,
  submitVendorApBillCandidate,
  submitVendorComplianceCandidate,
  submitVendorQuoteCandidate,
  CUSTOMER_PORTAL_SCOPES,
  VENDOR_PORTAL_SCOPES,
  type CustomerPortalScope,
  type CustomerPortalPreviewResult,
  type VendorPortalPreview,
  type VendorPortalScope,
} from '@/modules/portal';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';

export interface PortalActionState {
  ok?: boolean;
  error?: string;
}

export interface PortalPreviewState {
  ok?: boolean;
  error?: string;
  summary?: NonNullable<CustomerPortalPreviewResult['summary']>;
  documents?: CustomerPortalPreviewResult['documents'];
  denialReason?: CustomerPortalPreviewResult['denialReason'];
  neverExposed?: CustomerPortalPreviewResult['neverExposed'];
  scopesApplied?: CustomerPortalPreviewResult['scopesApplied'];
  publicLoginStatus?: CustomerPortalPreviewResult['publicLoginStatus'];
  identityModel?: CustomerPortalPreviewResult['identityModel'];
}

export interface VendorPortalPreviewState {
  ok?: boolean;
  error?: string;
  preview?: VendorPortalPreview;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createCustomerGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');

  const clientId = formValue(formData, 'clientId');
  const projectId = formValue(formData, 'projectId');
  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((scope): scope is CustomerPortalScope =>
      (CUSTOMER_PORTAL_SCOPES as readonly string[]).includes(scope),
    );

  try {
    await withOrgContext((context) =>
      createCustomerGrant(context, {
        email: formValue(formData, 'email') ?? '',
        displayName: formValue(formData, 'displayName') ?? null,
        clientId: clientId === 'none' ? null : (clientId ?? null),
        projectId: projectId === 'none' ? null : (projectId ?? null),
        scopes: scopes.length > 0 ? scopes : ['project.summary'],
        expiresAt: formValue(formData, 'expiresAt')
          ? new Date(formValue(formData, 'expiresAt')!).toISOString()
          : null,
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createVendorGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');

  const vendorId = formValue(formData, 'vendorId');
  const scopes = formData
    .getAll('vendorScopes')
    .map(String)
    .filter((scope): scope is VendorPortalScope =>
      (VENDOR_PORTAL_SCOPES as readonly string[]).includes(scope),
    );

  try {
    await withOrgContext((context) =>
      createVendorGrant(context, {
        email: formValue(formData, 'email') ?? '',
        displayName: formValue(formData, 'displayName') ?? null,
        vendorId: vendorId ?? '',
        scopes: scopes.length > 0 ? scopes : ['vendor.summary'],
        expiresAt: formValue(formData, 'expiresAt')
          ? new Date(formValue(formData, 'expiresAt')!).toISOString()
          : null,
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function recordVendorQuoteOnBehalfAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const vendorId = formValue(formData, 'vendorId');
  const currency = formValue(formData, 'currency') ?? '';
  const totalAmount = formValue(formData, 'totalAmount') ?? '';
  const lineDescription = formValue(formData, 'lineDescription') ?? '';
  const lineQuantity = formValue(formData, 'lineQuantity') ?? '1';
  const lineUnitAmount = formValue(formData, 'lineUnitAmount') ?? '';
  const lineTotal = formValue(formData, 'lineTotal') ?? totalAmount;

  try {
    await withOrgContext((context) =>
      recordVendorQuoteOnBehalf(context, {
        vendorId: vendorId ?? '',
        currency,
        totalAmount,
        receivedOn: formValue(formData, 'receivedOn') ?? null,
        notes: formValue(formData, 'notes') ?? null,
        lines: [
          {
            description: lineDescription,
            quantity: lineQuantity,
            unitAmount: lineUnitAmount || totalAmount,
            lineTotal: lineTotal || totalAmount,
            currency,
          },
        ],
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

/** Grant-scoped vendor quote candidate (requires quote.submit). Never finalizes. */
export async function submitVendorQuoteCandidateAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const grantId = formValue(formData, 'grantId') ?? '';
  const vendorId = formValue(formData, 'vendorId') ?? '';
  const currency = formValue(formData, 'currency') ?? '';
  const totalAmount = formValue(formData, 'totalAmount') ?? '';
  const lineDescription = formValue(formData, 'lineDescription') ?? '';
  const lineQuantity = formValue(formData, 'lineQuantity') ?? '1';
  const lineUnitAmount = formValue(formData, 'lineUnitAmount') ?? totalAmount;
  const lineTotal = formValue(formData, 'lineTotal') ?? totalAmount;

  try {
    await withOrgContext((context) =>
      submitVendorQuoteCandidate(context, {
        grantId,
        vendorId,
        currency,
        totalAmount,
        receivedOn: formValue(formData, 'receivedOn') ?? null,
        notes: formValue(formData, 'notes') ?? null,
        lines: [
          {
            description: lineDescription,
            quantity: lineQuantity,
            unitAmount: lineUnitAmount,
            lineTotal,
            currency,
          },
        ],
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function previewVendorPortalAction(
  _prev: VendorPortalPreviewState,
  formData: FormData,
): Promise<VendorPortalPreviewState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('portal');
  const grantId = formValue(formData, 'grantId');
  if (!grantId || grantId === 'none') {
    return { error: t('vendorPreview.needGrant') };
  }

  try {
    const preview = await withOrgContext((context) =>
      getVendorPortalPreview(context, { grantId }),
    );
    return { ok: true, preview };
  } catch (error) {
    if (error instanceof DomainRuleError) {
      return { error: t('vendorPreview.notAllowed') };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function submitVendorApBillCandidateAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const grantId = formValue(formData, 'grantId') ?? '';
  const vendorId = formValue(formData, 'vendorId') ?? '';
  const currency = formValue(formData, 'currency') ?? '';
  const totalAmount = formValue(formData, 'totalAmount') ?? '';
  const lineDescription = formValue(formData, 'lineDescription') ?? '';
  const lineQuantity = formValue(formData, 'lineQuantity') ?? '1';
  const lineUnitAmount = formValue(formData, 'lineUnitAmount') ?? totalAmount;
  const lineTotal = formValue(formData, 'lineTotal') ?? totalAmount;

  try {
    await withOrgContext((context) =>
      submitVendorApBillCandidate(context, {
        grantId,
        vendorId,
        reference: formValue(formData, 'reference') ?? null,
        currency,
        totalAmount,
        billDate: formValue(formData, 'billDate') ?? null,
        notes: formValue(formData, 'notes') ?? null,
        lines: [
          {
            description: lineDescription,
            quantity: lineQuantity,
            unitAmount: lineUnitAmount,
            lineTotal,
          },
        ],
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function submitVendorComplianceCandidateAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      submitVendorComplianceCandidate(context, {
        grantId: formValue(formData, 'grantId') ?? '',
        vendorId: formValue(formData, 'vendorId') ?? '',
        artifactKind: (formValue(formData, 'artifactKind') ?? 'other') as
          | 'insurance'
          | 'license'
          | 'certification'
          | 'other',
        name: formValue(formData, 'name') ?? '',
        referenceNumber: formValue(formData, 'referenceNumber') ?? null,
        expiresOn: formValue(formData, 'expiresOn') ?? null,
        notes: formValue(formData, 'notes') ?? null,
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function previewCustomerSafeSummaryAction(
  _prev: PortalPreviewState,
  formData: FormData,
): Promise<PortalPreviewState> {
  const tErrors = await getTranslations('errors');
  const tPortal = await getTranslations('portal');
  const projectId = formValue(formData, 'projectId');
  const grantId = formValue(formData, 'grantId');

  if (!projectId || projectId === 'none') {
    return { error: tErrors('validationFailed') };
  }

  try {
    const preview = await withOrgContext((context) =>
      previewCustomerPortalAccess(context, {
        projectId,
        grantId: grantId && grantId !== 'none' ? grantId : undefined,
      }),
    );

    if (!preview.ok) {
      const denialMessage =
        preview.denialReason === 'cross_customer'
          ? tPortal('preview.denials.crossCustomer')
          : preview.denialReason === 'grant_inactive'
            ? tPortal('preview.denials.grantInactive')
            : preview.denialReason === 'scope_denied'
              ? tPortal('preview.denials.scopeDenied')
              : preview.message ?? tErrors('validationFailed');
      return {
        error: denialMessage,
        denialReason: preview.denialReason,
        neverExposed: preview.neverExposed,
        scopesApplied: preview.scopesApplied,
        publicLoginStatus: preview.publicLoginStatus,
        identityModel: preview.identityModel,
      };
    }

    return {
      ok: true,
      summary: preview.summary ?? undefined,
      documents: preview.documents,
      neverExposed: preview.neverExposed,
      scopesApplied: preview.scopesApplied,
      publicLoginStatus: preview.publicLoginStatus,
      identityModel: preview.identityModel,
    };
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function revokeCustomerGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const grantId = formValue(formData, 'grantId');
  if (!grantId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => revokeCustomerGrant(context, { grantId }));
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function revokeVendorGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const grantId = formValue(formData, 'grantId');
  if (!grantId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => revokeVendorGrant(context, { grantId }));
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function reviewVendorCandidateAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const candidateId = formValue(formData, 'candidateId');
  const kind = formValue(formData, 'kind');
  const decision = formValue(formData, 'decision');
  if (
    !candidateId ||
    (kind !== 'ap_bill' && kind !== 'compliance') ||
    (decision !== 'accepted_for_review' && decision !== 'rejected')
  ) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const { reviewVendorPortalCandidate } = await import('@/modules/portal');
    await withOrgContext((context) =>
      reviewVendorPortalCandidate(context, {
        candidateId,
        kind,
        decision,
        reviewNote: formValue(formData, 'reviewNote') ?? null,
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
