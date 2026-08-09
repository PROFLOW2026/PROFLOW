import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';
import {
  assertCandidateQuoteStatus,
  assertVendorGrantActive,
  assertVendorGrantHasScope,
} from '../domain/safe-vendor-projection';
import {
  assertVendorInOrganization,
  findGrantById,
  findRfqInOrg,
  insertSupplierQuoteCandidate,
  insertSupplierQuoteLines,
} from '../data/portal.repository';
import {
  recordVendorQuoteOnBehalfSchema,
  submitVendorQuoteCandidateSchema,
  type RecordVendorQuoteOnBehalfInput,
  type SubmitVendorQuoteCandidateInput,
} from '../validation/schemas';
import { findProjectById } from '@/modules/projects';

function assertQuoteTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string; readonly currency: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'Supplier quote line currency must match the quote currency',
        'errors.validationFailed',
      );
    }
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.totalAmount, currency))) {
    throw new DomainRuleError(
      'Quote total must equal the sum of line totals',
      'errors.validationFailed',
    );
  }
}

async function insertReceivedQuote(
  context: OrgContext,
  input: {
    vendorId: string;
    rfqId?: string | null;
    projectId?: string | null;
    currency: string;
    totalAmount: string;
    receivedOn?: string | null;
    notes?: string | null;
    lines: readonly {
      description: string;
      quantity: string;
      unitAmount: string;
      lineTotal: string;
      currency: string;
    }[];
  },
) {
  assertCandidateQuoteStatus('received');
  assertQuoteTotalMatchesLines({
    currency: input.currency,
    totalAmount: input.totalAmount,
    lines: input.lines,
  });

  if (input.rfqId) {
    const rfq = await findRfqInOrg(context.db, context.organizationId, input.rfqId);
    if (!rfq) throw new NotFoundError('RFQ');
  }

  if (input.projectId) {
    const project = await findProjectById(context.db, context.organizationId, input.projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  const quote = await insertSupplierQuoteCandidate(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    rfqId: input.rfqId ?? null,
    projectId: input.projectId ?? null,
    status: 'received',
    currency: input.currency.toUpperCase(),
    totalAmount: input.totalAmount,
    receivedOn: input.receivedOn ?? null,
    notes: input.notes ?? null,
  });

  await insertSupplierQuoteLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      supplierQuoteId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency.toUpperCase(),
      sortOrder: index,
    })),
  );

  return quote;
}

/**
 * Domain candidate intake path: asserts vendor grant scopes.
 * Stores supplier_quote as `received` only — never finalizes financials.
 * Public auth is not wired; this is the grant-scoped intake contract for later login.
 */
export async function submitVendorQuoteCandidate(
  context: OrgContext,
  raw: SubmitVendorQuoteCandidateInput,
) {
  // Foundation: org admin exercises this path until public portal login exists.
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = submitVendorQuoteCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const grant = await findGrantById(context.organizationId, input.grantId);
  if (!grant) throw new NotFoundError('Vendor portal grant');

  assertVendorGrantActive(grant, input.vendorId);
  assertVendorGrantHasScope(grant, 'quote.submit');

  const quote = await insertReceivedQuote(context, input);

  await noteModuleUsage(context.db, context.organizationId, 'portal');
  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUPPLIER_QUOTE_RECEIVED,
    entityType: 'supplier_quote',
    entityId: quote.id,
    after: {
      id: quote.id,
      status: quote.status,
      vendorId: quote.vendorId,
      grantId: grant.id,
      candidate: true,
      finalized: false,
    },
  });

  return quote;
}

/**
 * Admin records a vendor quote on behalf of the vendor.
 * Still stored as `received` for PROCUREMENT_MANAGE review — external cannot finalize.
 */
export async function recordVendorQuoteOnBehalf(
  context: OrgContext,
  raw: RecordVendorQuoteOnBehalfInput,
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = recordVendorQuoteOnBehalfSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const ok = await assertVendorInOrganization(context.db, context.organizationId, input.vendorId);
  if (!ok) throw new NotFoundError('Vendor');

  const quote = await insertReceivedQuote(context, input);

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUPPLIER_QUOTE_RECEIVED,
    entityType: 'supplier_quote',
    entityId: quote.id,
    after: {
      id: quote.id,
      status: quote.status,
      vendorId: quote.vendorId,
      onBehalf: true,
      candidate: true,
      finalized: false,
    },
  });

  return quote;
}
