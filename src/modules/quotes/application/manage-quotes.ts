import { and, eq } from 'drizzle-orm';
import { clients, clientContacts } from '@drizzle/schema';
import { resolveApplicableDefaultTax, resolveTaxForDate } from '@/modules/tax';
import { noteModuleUsage, resolveAllocatedReference, titleWithDocumentNumber } from '@/modules/tenancy';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertQuoteEditable } from '../domain/lifecycle';
import { computeQuoteTotals } from '../domain/totals';
import { QUOTES_AUDIT_ACTIONS, type QuoteDetail, type QuoteRecord } from '../domain/types';
import {
  findQuoteById,
  findQuoteDetail,
  insertQuote,
  replaceQuoteLines,
  updateQuoteById,
} from '../data/quotes.repository';
import {
  createQuoteSchema,
  updateQuoteSchema,
  type CreateQuoteInput,
  type UpdateQuoteInput,
} from '../validation/schemas';

async function assertClientInOrg(
  context: OrgContext,
  clientId: string | null | undefined,
): Promise<void> {
  if (!clientId) return;
  const [row] = await context.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Client');
}

async function assertContactInOrg(
  context: OrgContext,
  contactId: string | null | undefined,
  clientId: string | null | undefined,
): Promise<void> {
  if (!contactId) return;
  const [row] = await context.db
    .select({ id: clientContacts.id, clientId: clientContacts.clientId })
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.id, contactId),
        eq(clientContacts.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError('Contact');
  if (clientId && row.clientId !== clientId) {
    throw new ValidationError([{ path: 'contactId', message: 'Contact must belong to the client' }]);
  }
}

async function resolveTaxForQuote(
  context: OrgContext,
  taxMode: 'exclusive' | 'inclusive' | 'none',
  taxRuleId: string | null | undefined,
) {
  if (taxMode === 'none') return { resolved: null, ruleId: null as string | null };
  const on = todayInTimeZone(context.organization.timezone);
  if (taxRuleId) {
    // Prefer keyed resolution when a rule id is supplied — fall back to default.
    const byDefault = await resolveApplicableDefaultTax(context, on);
    if (byDefault.resolved?.ruleId === taxRuleId) {
      return { resolved: byDefault.resolved, ruleId: taxRuleId };
    }
    try {
      const listed = await resolveTaxForDate(context, on);
      if (listed.resolved) {
        return { resolved: listed.resolved, ruleId: listed.resolved.ruleId };
      }
    } catch {
      // resolveTaxForDate requires TAX_MANAGE; default path is enough for quotes.
    }
    return { resolved: byDefault.resolved, ruleId: byDefault.resolved?.ruleId ?? taxRuleId };
  }
  const resolution = await resolveApplicableDefaultTax(context, on);
  return { resolved: resolution.resolved, ruleId: resolution.resolved?.ruleId ?? null };
}

export async function createQuote(
  context: OrgContext,
  rawInput: CreateQuoteInput,
): Promise<QuoteDetail> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);

  const parsed = createQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const currency = (input.currency ?? context.organization.baseCurrency).toUpperCase();
  const taxMode = input.taxMode ?? 'exclusive';
  const documentNumber = await resolveAllocatedReference(context, 'estimate', input.reference);
  const title = titleWithDocumentNumber(input.title, documentNumber);

  await assertClientInOrg(context, input.clientId);
  await assertContactInOrg(context, input.contactId, input.clientId ?? null);

  const { resolved, ruleId } = await resolveTaxForQuote(context, taxMode, input.taxRuleId);
  const totals = computeQuoteTotals({
    lines: input.lines,
    currency,
    taxMode,
    resolved,
  });

  const quote = await insertQuote(context.db, {
    organizationId: context.organizationId,
    clientId: input.clientId ?? null,
    contactId: input.contactId ?? null,
    title,
    description: input.description ?? null,
    status: 'draft',
    currency,
    taxMode,
    taxRuleId: ruleId,
    validityDate: input.validityDate ?? null,
    notes: input.notes ?? null,
    subtotalAmount: totals.subtotalAmount,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    estimatedCostAmount: totals.estimatedCostAmount,
    estimatedMarginPercent: totals.estimatedMarginPercent,
    discountAmount: input.discountAmount ?? null,
    listSubtotalAmount: input.listSubtotalAmount ?? null,
    discountPercent: input.discountPercent ?? null,
    createdByUserId: context.userId,
  });

  const lines = await replaceQuoteLines(
    context.db,
    context.organizationId,
    quote.id,
    totals.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceAmount: line.unitPriceAmount,
      estimatedUnitCostAmount: line.estimatedUnitCostAmount,
      lineTotalAmount: line.lineTotalAmount,
      notes: line.notes,
      sortOrder: line.sortOrder,
    })),
  );

  await noteModuleUsage(context.db, context.organizationId, 'quotes');
  await recordAuditEvent(context, {
    action: QUOTES_AUDIT_ACTIONS.CREATED,
    entityType: 'estimate_quote',
    entityId: quote.id,
    after: {
      title: quote.title,
      status: quote.status,
      currency,
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      estimatedCostAmount: totals.estimatedCostAmount,
      estimatedMarginPercent: totals.estimatedMarginPercent,
      isNotBilling: true,
      isNotRevenue: true,
    },
  });

  return {
    ...quote,
    lines,
    clientName: null,
  };
}

export async function updateQuote(
  context: OrgContext,
  rawInput: UpdateQuoteInput,
): Promise<QuoteRecord> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);

  const parsed = updateQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findQuoteById(context.db, context.organizationId, input.quoteId);
  if (!existing) throw new NotFoundError('Quote');
  assertQuoteEditable(existing.status);

  const clientId = input.clientId !== undefined ? input.clientId : existing.clientId;
  const contactId = input.contactId !== undefined ? input.contactId : existing.contactId;
  await assertClientInOrg(context, clientId);
  await assertContactInOrg(context, contactId, clientId);

  const currency = (input.currency ?? existing.currency).toUpperCase();
  const taxMode = input.taxMode ?? existing.taxMode;
  const taxRuleId = input.taxRuleId !== undefined ? input.taxRuleId : existing.taxRuleId;

  let totalsPatch: Partial<QuoteRecord> = {};
  if (input.lines) {
    const { resolved, ruleId } = await resolveTaxForQuote(context, taxMode, taxRuleId);
    const totals = computeQuoteTotals({
      lines: input.lines,
      currency,
      taxMode,
      resolved,
    });
    await replaceQuoteLines(
      context.db,
      context.organizationId,
      existing.id,
      totals.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceAmount: line.unitPriceAmount,
        estimatedUnitCostAmount: line.estimatedUnitCostAmount,
        lineTotalAmount: line.lineTotalAmount,
        notes: line.notes,
        sortOrder: line.sortOrder,
      })),
    );
    totalsPatch = {
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      estimatedCostAmount: totals.estimatedCostAmount,
      estimatedMarginPercent: totals.estimatedMarginPercent,
      taxRuleId: ruleId,
    };
  }

  const updated = await updateQuoteById(context.db, context.organizationId, existing.id, {
    title: input.title,
    description: input.description === undefined ? undefined : input.description,
    clientId: input.clientId === undefined ? undefined : input.clientId,
    contactId: input.contactId === undefined ? undefined : input.contactId,
    currency,
    taxMode,
    validityDate: input.validityDate === undefined ? undefined : input.validityDate,
    notes: input.notes === undefined ? undefined : input.notes,
    discountAmount: input.discountAmount === undefined ? undefined : input.discountAmount,
    listSubtotalAmount: input.listSubtotalAmount === undefined ? undefined : input.listSubtotalAmount,
    discountPercent: input.discountPercent === undefined ? undefined : input.discountPercent,
    ...totalsPatch,
  });
  if (!updated) throw new NotFoundError('Quote');

  await noteModuleUsage(context.db, context.organizationId, 'quotes');
  await recordAuditEvent(context, {
    action: QUOTES_AUDIT_ACTIONS.UPDATED,
    entityType: 'estimate_quote',
    entityId: updated.id,
    after: {
      title: updated.title,
      status: updated.status,
      subtotalAmount: updated.subtotalAmount,
      totalAmount: updated.totalAmount,
    },
  });

  return updated;
}

export async function getQuoteDetail(
  context: OrgContext,
  quoteId: string,
): Promise<QuoteDetail | null> {
  assertPermission(context, PERMISSIONS.QUOTES_READ);
  return findQuoteDetail(context.db, context.organizationId, quoteId);
}
