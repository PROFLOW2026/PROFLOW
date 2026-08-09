import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';
import {
  assertPortalCandidateDoesNotMutateFinancialTruth,
  assertVendorGrantActive,
  assertVendorGrantHasScope,
  portalCandidateMutatesFinancialTruth,
} from '../domain/safe-vendor-projection';
import { findGrantById } from '../data/portal.repository';
import {
  insertVendorApBillCandidate,
  listVendorApBillCandidatesForVendor,
} from '../data/vendor-portal-candidates.store';
import {
  submitVendorApBillCandidateSchema,
  type SubmitVendorApBillCandidateInput,
} from '../validation/schemas';
import type { VendorApBillCandidate } from '../domain/types';

function assertBillTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.totalAmount, currency))) {
    throw new DomainRuleError(
      'Bill candidate total must equal the sum of line totals',
      'errors.validationFailed',
    );
  }
}

/**
 * Vendor AP bill intake as CANDIDATE only.
 * NEVER writes ap_bills / expenses / payments. Internal staff must create
 * canonical AP after review.
 */
export async function submitVendorApBillCandidate(
  context: OrgContext,
  raw: SubmitVendorApBillCandidateInput,
): Promise<VendorApBillCandidate> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);
  assertPortalCandidateDoesNotMutateFinancialTruth();

  const parsed = submitVendorApBillCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const grant = await findGrantById(context.organizationId, input.grantId);
  if (!grant) throw new NotFoundError('Vendor portal grant');

  assertVendorGrantActive(grant, input.vendorId);
  assertVendorGrantHasScope(grant, 'bill.candidate');
  assertBillTotalMatchesLines({
    currency: input.currency,
    totalAmount: input.totalAmount,
    lines: input.lines,
  });

  const candidate = insertVendorApBillCandidate({
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    grantId: grant.id,
    principalId: grant.principalId,
    reference: input.reference ?? null,
    currency: input.currency,
    totalAmount: input.totalAmount,
    billDate: input.billDate ?? null,
    notes: input.notes ?? null,
    lines: input.lines,
  });

  if (candidate.mutatesFinancialTruth !== false || portalCandidateMutatesFinancialTruth()) {
    throw new DomainRuleError(
      'Vendor portal candidates must not mutate financial truth',
      'portal.errors.financialMutationForbidden',
    );
  }

  await noteModuleUsage(context.db, context.organizationId, 'portal');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_VENDOR_AP_CANDIDATE,
    entityType: 'vendor_ap_bill_candidate',
    entityId: candidate.id,
    after: {
      id: candidate.id,
      vendorId: candidate.vendorId,
      grantId: candidate.grantId,
      totalAmount: candidate.totalAmount,
      currency: candidate.currency,
      status: candidate.status,
      mutatesFinancialTruth: false,
      apBillCreated: false,
      expenseCreated: false,
    },
  });

  return candidate;
}

export function listApBillCandidatesForVendorGrant(
  organizationId: string,
  vendorId: string,
): VendorApBillCandidate[] {
  return listVendorApBillCandidatesForVendor(organizationId, vendorId);
}
