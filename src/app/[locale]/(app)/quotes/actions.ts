'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  convertQuote,
  createQuote,
  transitionQuoteStatus,
  updateQuote,
  type QuoteStatus,
  type QuoteTaxMode,
} from '@/modules/quotes';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface QuotesFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function optionalUuid(formData: FormData, key: string): string | null | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '' || text === '__none__') return null;
  return text;
}

function mapValidationError(error: ValidationError): QuotesFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<QuotesFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('quotes');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    if (error.messageKey.startsWith('approvals.')) {
      const tApprovals = await getTranslations('approvals');
      const approvalsKey = error.messageKey.replace(/^approvals\./, '');
      try {
        return { error: tApprovals(approvalsKey as 'errors.submittedPending') };
      } catch {
        return { error: error.message };
      }
    }
    const key = error.messageKey.replace(/^quotes\./, '');
    try {
      return { error: t(key as 'errors.invalidTransition') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

function parseLines(formData: FormData) {
  const count = Number(formData.get('lineCount') ?? '0');
  const lines: Array<{
    description: string;
    quantity: string;
    unit?: string | null;
    unitPriceAmount: string;
    estimatedUnitCostAmount?: string | null;
    notes?: string | null;
  }> = [];

  for (let i = 0; i < count; i += 1) {
    const description = formValue(formData, `line.${i}.description`);
    const unitPriceAmount = formValue(formData, `line.${i}.unitPriceAmount`);
    if (!description || !unitPriceAmount) continue;
    lines.push({
      description,
      quantity: formValue(formData, `line.${i}.quantity`) ?? '1',
      unit: formValue(formData, `line.${i}.unit`) ?? null,
      unitPriceAmount,
      estimatedUnitCostAmount: formValue(formData, `line.${i}.estimatedUnitCostAmount`) ?? null,
      notes: formValue(formData, `line.${i}.notes`) ?? null,
    });
  }
  return lines;
}

export async function createQuoteAction(
  _prev: QuotesFormState,
  formData: FormData,
): Promise<QuotesFormState> {
  const locale = await getLocale();
  try {
    const created = await withOrgContext((context) =>
      createQuote(context, {
        title: formValue(formData, 'title') ?? '',
        description: formValue(formData, 'description') ?? null,
        clientId: optionalUuid(formData, 'clientId'),
        currency: formValue(formData, 'currency'),
        taxMode: (formValue(formData, 'taxMode') as QuoteTaxMode | undefined) ?? 'exclusive',
        validityDate: formValue(formData, 'validityDate') ?? null,
        notes: formValue(formData, 'notes') ?? null,
        reference: formValue(formData, 'reference') ?? null,
        discountAmount: formValue(formData, 'discountAmount') ?? null,
        listSubtotalAmount: formValue(formData, 'listSubtotalAmount') ?? null,
        discountPercent: formValue(formData, 'discountPercent') ?? null,
        lines: parseLines(formData),
        opportunityId: optionalUuid(formData, 'opportunityId'),
      }),
    );
    revalidatePath('/quotes');
    revalidatePath('/crm');
    redirect({ href: `/quotes/${created.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateQuoteAction(
  _prev: QuotesFormState,
  formData: FormData,
): Promise<QuotesFormState> {
  try {
    const quoteId = formValue(formData, 'quoteId') ?? '';
    await withOrgContext((context) =>
      updateQuote(context, {
        quoteId,
        title: formValue(formData, 'title'),
        description: formValue(formData, 'description') ?? null,
        clientId: optionalUuid(formData, 'clientId'),
        currency: formValue(formData, 'currency'),
        taxMode: formValue(formData, 'taxMode') as QuoteTaxMode | undefined,
        validityDate: formValue(formData, 'validityDate') ?? null,
        notes: formValue(formData, 'notes') ?? null,
        discountAmount: formValue(formData, 'discountAmount') ?? null,
        listSubtotalAmount: formValue(formData, 'listSubtotalAmount') ?? null,
        discountPercent: formValue(formData, 'discountPercent') ?? null,
        lines: parseLines(formData),
      }),
    );
    revalidatePath('/quotes');
    revalidatePath(`/quotes/${quoteId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function transitionQuoteAction(
  _prev: QuotesFormState,
  formData: FormData,
): Promise<QuotesFormState> {
  try {
    const quoteId = formValue(formData, 'quoteId') ?? '';
    const toStatus = formValue(formData, 'toStatus') as QuoteStatus;
    await withOrgContext((context) =>
      transitionQuoteStatus(context, { quoteId, toStatus }),
    );
    revalidatePath('/quotes');
    revalidatePath(`/quotes/${quoteId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function convertQuoteAction(
  _prev: QuotesFormState,
  formData: FormData,
): Promise<QuotesFormState> {
  const locale = await getLocale();
  try {
    const result = await withOrgContext((context) =>
      convertQuote(context, {
        quoteId: formValue(formData, 'quoteId') ?? '',
        workKind:
          (formValue(formData, 'workKind') as 'project' | 'job' | 'work_order' | undefined) ??
          'project',
        projectName: formValue(formData, 'projectName') ?? null,
        pricingMode: (formValue(formData, 'pricingMode') as 'fixed' | 'open' | undefined) ?? 'fixed',
        amountIncludesTax: formValue(formData, 'amountIncludesTax') === 'true',
      }),
    );
    revalidatePath('/quotes');
    revalidatePath(`/quotes/${result.quote.id}`);
    const href =
      result.workKind === 'job'
        ? `/jobs/${result.projectId}`
        : result.workKind === 'work_order'
          ? `/work-orders/${result.projectId}`
          : `/projects/${result.projectId}`;
    redirect({ href, locale });
  } catch (error) {
    return mapAppError(error);
  }
}
