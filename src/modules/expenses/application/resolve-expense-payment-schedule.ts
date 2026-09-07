import type { OrgContext } from '@/shared/auth/context';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  getCatalogEntryById,
  parsePaymentTermMetadata,
  resolveExpensePaymentTermId,
  resolveOrgDefaultPaymentTermIdForContext,
  suggestDueDateFromPaymentTerm,
} from '@/modules/business-catalog';
import { findVendorById } from '@/modules/vendors';
import { nextOccurrenceOfDayOfMonth } from '../domain/cash-installment-schedule';
import type { RecurringFinancialDraftRecord } from '@/modules/recurring-drafts/domain/types';

export interface ResolvedExpensePaymentSchedule {
  readonly paymentTermId: string | null;
  readonly dueDate: BusinessDate | null;
}

export async function resolveExpensePaymentSchedule(
  context: OrgContext,
  input: {
    readonly expenseDate: BusinessDate;
    readonly vendorId?: string | null;
    readonly paymentTermId?: string | null;
    readonly dueDate?: string | null;
    readonly recurringDraft?: Pick<
      RecurringFinancialDraftRecord,
      'paymentTermId' | 'paymentConfirmationOverride' | 'recurringPaymentDay' | 'draftKind'
    > | null;
  },
): Promise<ResolvedExpensePaymentSchedule> {
  const vendor = input.vendorId
    ? await findVendorById(context.db, context.organizationId, input.vendorId)
    : null;
  const orgDefaultId = await resolveOrgDefaultPaymentTermIdForContext(context);

  const paymentTermId = resolveExpensePaymentTermId({
    explicitId: input.recurringDraft?.paymentTermId ?? input.paymentTermId,
    vendorDefaultId: vendor?.defaultPaymentTermId ?? null,
    orgDefaultId,
  });

  let paymentTermMeta = null;
  if (paymentTermId) {
    const termEntry = await getCatalogEntryById(
      context.db,
      context.organizationId,
      paymentTermId,
    );
    paymentTermMeta = termEntry ? parsePaymentTermMetadata(termEntry.metadata) : null;
  }

  const termDueRaw = suggestDueDateFromPaymentTerm({
    baseDateIso: input.expenseDate,
    dueDate: input.dueDate,
    term: paymentTermMeta,
  });

  let dueDate: BusinessDate | null = termDueRaw ? businessDate(termDueRaw) : null;

  // Recurring payment day applies only to recurring draft expenses — never overrides vendor terms on invoices.
  if (
    !dueDate &&
    input.recurringDraft?.draftKind === 'expense' &&
    input.recurringDraft.recurringPaymentDay
  ) {
    dueDate = nextOccurrenceOfDayOfMonth(input.expenseDate, input.recurringDraft.recurringPaymentDay);
  }

  if (!dueDate && input.dueDate) {
    dueDate = businessDate(input.dueDate);
  }

  return { paymentTermId, dueDate };
}
