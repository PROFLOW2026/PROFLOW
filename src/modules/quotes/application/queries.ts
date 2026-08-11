import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { QuoteDetail, QuoteListItem } from '../domain/types';
import { findQuoteDetail, listQuotes } from '../data/quotes.repository';
import { listQuotesSchema, type ListQuotesInput } from '../validation/schemas';

export async function listQuotesForOrg(
  context: OrgContext,
  rawFilters: ListQuotesInput = {},
): Promise<QuoteListItem[]> {
  assertPermission(context, PERMISSIONS.QUOTES_READ);

  const parsed = listQuotesSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listQuotes(context.db, context.organizationId, parsed.data);
}

export async function getQuoteById(
  context: OrgContext,
  quoteId: string,
): Promise<QuoteDetail> {
  assertPermission(context, PERMISSIONS.QUOTES_READ);
  const detail = await findQuoteDetail(context.db, context.organizationId, quoteId);
  if (!detail) throw new NotFoundError('Quote');
  return detail;
}
