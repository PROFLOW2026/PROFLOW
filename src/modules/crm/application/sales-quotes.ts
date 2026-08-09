import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, sumMoney, toNumericString, zeroMoney } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findOpportunityById,
  findSalesQuoteById,
  findSalesQuoteVersionById,
  insertSalesQuote,
  insertSalesQuoteVersion,
  listSalesQuoteVersions,
  nextSalesQuoteVersionNumber,
  replaceSalesQuoteLines,
  supersedeDraftAndIssuedVersions,
  updateSalesQuoteById,
  updateSalesQuoteVersionById,
} from '../data/crm.repository';
import {
  canAcceptSalesQuoteVersion,
  canIssueSalesQuoteVersion,
  salesQuoteStatusAfterAccept,
  salesQuoteStatusAfterIssue,
} from '../domain/sales-quote-version-rules';
import {
  CRM_AUDIT_ACTIONS,
  type SalesQuoteRecord,
  type SalesQuoteVersionRecord,
} from '../domain/types';
import {
  acceptSalesQuoteVersionSchema,
  createSalesQuoteSchema,
  createSalesQuoteVersionSchema,
  issueSalesQuoteVersionSchema,
  type CreateSalesQuoteInput,
  type CreateSalesQuoteVersionInput,
} from '../validation/schemas';

function computeSalesQuoteTotals(
  lines: readonly { lineTotal: string; currency: string }[],
  currency: string,
  taxAmount: string | null | undefined,
): { subtotal: string; tax: string | null; total: string } {
  const lineValues = lines.map((line) => money(line.lineTotal, line.currency));
  const subtotal = sumMoney(lineValues, currency);
  const tax = taxAmount ? money(taxAmount, currency) : zeroMoney(currency);
  const total = taxAmount ? sumMoney([subtotal, tax], currency) : subtotal;

  return {
    subtotal: toNumericString(subtotal),
    tax: taxAmount ? toNumericString(tax) : null,
    total: toNumericString(total),
  };
}

export async function createSalesQuote(
  context: OrgContext,
  rawInput: CreateSalesQuoteInput,
): Promise<{ quote: SalesQuoteRecord; version: SalesQuoteVersionRecord }> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createSalesQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError('Opportunity');

  const currency = (
    input.currency ??
    opportunity.currency ??
    context.organization.baseCurrency
  ).toUpperCase();

  const lines = input.lines.map((line, index) => ({
    description: line.description,
    quantity: line.quantity ?? '1',
    unitAmount: line.unitAmount,
    lineTotal: line.lineTotal,
    currency,
    sortOrder: index,
  }));
  const totals = computeSalesQuoteTotals(lines, currency, input.taxAmount);

  const quote = await insertSalesQuote(context.db, {
    organizationId: context.organizationId,
    opportunityId: input.opportunityId,
    title: input.title,
    currency,
  });

  const version = await insertSalesQuoteVersion(context.db, {
    organizationId: context.organizationId,
    salesQuoteId: quote.id,
    versionNumber: 1,
    subtotalAmount: totals.subtotal,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    currency,
    alternateLabel: input.alternateLabel ?? null,
    notes: input.notes ?? null,
  });

  await replaceSalesQuoteLines(context.db, context.organizationId, version.id, lines);

  await noteModuleUsage(context.db, context.organizationId, 'crm');
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.SALES_QUOTE_CREATED,
    entityType: 'crm_sales_quote',
    entityId: quote.id,
    after: {
      opportunityId: quote.opportunityId,
      versionId: version.id,
      currency,
      subtotalAmount: version.subtotalAmount,
      taxAmount: version.taxAmount,
      totalAmount: version.totalAmount,
      isNotBilling: true,
    },
  });

  return { quote, version };
}

export async function createSalesQuoteVersion(
  context: OrgContext,
  rawInput: CreateSalesQuoteVersionInput,
): Promise<SalesQuoteVersionRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createSalesQuoteVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const quote = await findSalesQuoteById(context.db, context.organizationId, input.salesQuoteId);
  if (!quote) throw new NotFoundError('Sales quote');

  if (quote.status === 'accepted' || quote.status === 'cancelled') {
    throw new DomainRuleError(
      'Cannot add versions to a finalized sales quote',
      'crm.errors.quoteFinalized',
    );
  }

  // New draft supersedes prior drafts; issued versions stay until this one is issued.
  const prior = await listSalesQuoteVersions(context.db, context.organizationId, quote.id);
  for (const version of prior) {
    if (version.status === 'draft') {
      await updateSalesQuoteVersionById(context.db, context.organizationId, version.id, {
        status: 'superseded',
      });
    }
  }

  const versionNumber = await nextSalesQuoteVersionNumber(
    context.db,
    context.organizationId,
    quote.id,
  );

  const lines = input.lines.map((line, index) => ({
    description: line.description,
    quantity: line.quantity ?? '1',
    unitAmount: line.unitAmount,
    lineTotal: line.lineTotal,
    currency: quote.currency,
    sortOrder: index,
  }));
  const totals = computeSalesQuoteTotals(lines, quote.currency, input.taxAmount);

  const version = await insertSalesQuoteVersion(context.db, {
    organizationId: context.organizationId,
    salesQuoteId: quote.id,
    versionNumber,
    subtotalAmount: totals.subtotal,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    currency: quote.currency,
    alternateLabel: input.alternateLabel ?? null,
    notes: input.notes ?? null,
  });

  await replaceSalesQuoteLines(context.db, context.organizationId, version.id, lines);

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return version;
}

export async function issueSalesQuoteVersion(
  context: OrgContext,
  rawInput: unknown,
): Promise<SalesQuoteVersionRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = issueSalesQuoteVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const version = await findSalesQuoteVersionById(
    context.db,
    context.organizationId,
    parsed.data.versionId,
  );
  if (!version) throw new NotFoundError('Sales quote version');

  if (!canIssueSalesQuoteVersion(version)) {
    throw new DomainRuleError(
      'Only draft sales quote versions can be issued',
      'crm.errors.cannotIssueVersion',
    );
  }

  const quote = await findSalesQuoteById(context.db, context.organizationId, version.salesQuoteId);
  if (!quote) throw new NotFoundError('Sales quote');

  await supersedeDraftAndIssuedVersions(
    context.db,
    context.organizationId,
    quote.id,
    version.id,
  );

  const issued = await updateSalesQuoteVersionById(
    context.db,
    context.organizationId,
    version.id,
    { status: 'issued', issuedAt: new Date() },
  );
  if (!issued) throw new NotFoundError('Sales quote version');

  await updateSalesQuoteById(context.db, context.organizationId, quote.id, {
    status: salesQuoteStatusAfterIssue(quote.status),
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return issued;
}

export async function acceptSalesQuoteVersion(
  context: OrgContext,
  rawInput: unknown,
): Promise<SalesQuoteVersionRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = acceptSalesQuoteVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const version = await findSalesQuoteVersionById(
    context.db,
    context.organizationId,
    parsed.data.versionId,
  );
  if (!version) throw new NotFoundError('Sales quote version');

  if (!canAcceptSalesQuoteVersion(version)) {
    throw new DomainRuleError(
      'Only draft or issued sales quote versions can be accepted',
      'crm.errors.cannotAcceptVersion',
    );
  }

  const quote = await findSalesQuoteById(context.db, context.organizationId, version.salesQuoteId);
  if (!quote) throw new NotFoundError('Sales quote');

  const siblings = await listSalesQuoteVersions(context.db, context.organizationId, quote.id);
  for (const sibling of siblings) {
    if (sibling.id === version.id) continue;
    if (sibling.status === 'draft' || sibling.status === 'issued') {
      await updateSalesQuoteVersionById(context.db, context.organizationId, sibling.id, {
        status: 'superseded',
      });
    }
  }

  const accepted = await updateSalesQuoteVersionById(
    context.db,
    context.organizationId,
    version.id,
    {
      status: 'accepted',
      issuedAt: version.issuedAt ?? new Date(),
    },
  );
  if (!accepted) throw new NotFoundError('Sales quote version');

  await updateSalesQuoteById(context.db, context.organizationId, quote.id, {
    status: salesQuoteStatusAfterAccept(),
    acceptedVersionId: accepted.id,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.QUOTE_ACCEPTED,
    entityType: 'crm_sales_quote_version',
    entityId: accepted.id,
    after: { status: accepted.status, salesQuoteId: quote.id },
  });

  return accepted;
}
