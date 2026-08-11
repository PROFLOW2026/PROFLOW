import {
  assertVendorInOrganization,
  insertApBill,
  insertApBillLines,
} from '@/modules/ap';
import { createBillingRecord } from '@/modules/billing';
import { createExpense } from '@/modules/expenses';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanManageDraftKind } from '../domain/permissions';
import { assertDraftGeneratable } from '../domain/lifecycle';
import {
  assertGeneratedEntityIsDraft,
  billingInputFromPayload,
  expenseInputFromPayload,
  vendorBillDraftInsertFromPayload,
} from '../domain/payload';
import { bumpScheduleAfterGenerate } from '../domain/schedule';
import type { DraftKind } from '../domain/types';
import {
  findRecurringDraftById,
  findRunByDraftAndDate,
  insertRecurringDraftRun,
  updateRecurringDraftById,
} from '../data/recurring-drafts.repository';
import { generateRecurringDraftSchema } from '../validation/schemas';
import { parseStoredPayload } from './parse-payload';

export interface GenerateRecurringDraftResult {
  readonly draftId: string;
  readonly runDate: string;
  readonly generatedEntityType: DraftKind;
  readonly generatedEntityId: string;
  readonly generatedStatus: 'draft';
  readonly nextRunDate: string;
  readonly templateStatus: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

async function createDraftEntity(
  context: OrgContext,
  kind: DraftKind,
  payload: ReturnType<typeof parseStoredPayload>,
  runDate: ReturnType<typeof todayInTimeZone>,
  templateTitle: string,
): Promise<{ id: string; status: string }> {
  switch (kind) {
    case 'expense': {
      assertPermission(context, PERMISSIONS.EXPENSES_CREATE);
      if (payload.kind !== 'expense') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const input = expenseInputFromPayload(payload.data, runDate);
      const note = `Generated from recurring draft “${templateTitle}”. Draft only.`;
      const created = await createExpense(context, {
        ...input,
        notes: [input.notes?.trim() || null, note].filter(Boolean).join('\n'),
      });
      return { id: created.id, status: created.status };
    }
    case 'vendor_bill': {
      if (payload.kind !== 'vendor_bill') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const insert = vendorBillDraftInsertFromPayload(payload.data, runDate, templateTitle);
      const vendorOk = await assertVendorInOrganization(
        context.db,
        context.organizationId,
        insert.vendorId,
      );
      if (!vendorOk) throw new NotFoundError('Vendor');

      const bill = await insertApBill(context.db, {
        organizationId: context.organizationId,
        vendorId: insert.vendorId,
        projectId: insert.projectId,
        purchaseOrderId: null,
        reference: insert.reference,
        status: 'draft',
        billDate: insert.billDate,
        dueDate: insert.dueDate,
        currency: insert.currency,
        totalAmount: insert.totalAmount,
        notes: insert.notes,
      });

      if (bill.status !== 'draft') {
        throw new DomainRuleError(
          'Vendor bill insert did not remain draft',
          'recurringDrafts.errors.mustRemainDraft',
        );
      }

      await insertApBillLines(
        context.db,
        insert.lines.map((line, index) => ({
          organizationId: context.organizationId,
          apBillId: bill.id,
          description: line.description,
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          lineTotal: line.lineTotal,
          currency: line.currency,
          purchaseOrderLineId: null,
          sortOrder: index,
        })),
      );

      return { id: bill.id, status: bill.status };
    }
    case 'billing_record': {
      if (payload.kind !== 'billing_record') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const input = billingInputFromPayload(payload.data, runDate);
      const note = `Generated from recurring draft “${templateTitle}”. Draft only.`;
      const created = await createBillingRecord(context, {
        ...input,
        notes: [input.notes?.trim() || null, note].filter(Boolean).join('\n'),
        finalize: false,
      });
      return { id: created.id, status: created.status };
    }
  }
}

/**
 * Creates one DRAFT expense / vendor bill / billing record from the template.
 * Never finalizes, never posts, never recognizes Actual.
 */
export async function generateRecurringDraftNow(
  context: OrgContext,
  raw: { readonly draftId: string },
): Promise<GenerateRecurringDraftResult> {
  const parsed = generateRecurringDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurringDraftById(
    context.db,
    context.organizationId,
    parsed.data.draftId,
  );
  if (!existing) throw new NotFoundError('Recurring draft');

  assertCanManageDraftKind(context, existing.draftKind);
  assertDraftGeneratable(existing.status);

  const payload = parseStoredPayload(existing.draftKind, existing.payloadJson);
  const runDate = todayInTimeZone(context.organization.timezone);

  const already = await findRunByDraftAndDate(
    context.db,
    context.organizationId,
    existing.id,
    runDate,
  );
  if (already) {
    throw new ConflictError(
      'A draft was already generated for this template today',
      'recurringDrafts.errors.alreadyGeneratedToday',
    );
  }

  try {
    return await withTransaction(context.db, async (tx) => {
      const txContext: OrgContext = { ...context, db: tx };
      const created = await createDraftEntity(
        txContext,
        existing.draftKind,
        payload,
        runDate,
        existing.title,
      );
      assertGeneratedEntityIsDraft({ kind: existing.draftKind, status: created.status });

      await insertRecurringDraftRun(tx, {
        organizationId: context.organizationId,
        draftId: existing.id,
        runDate,
        generatedEntityType: existing.draftKind,
        generatedEntityId: created.id,
        notes: 'Manual generate-now — draft only, not posted.',
      });

      const bumped = bumpScheduleAfterGenerate({
        currentNextRunDate: existing.nextRunDate,
        runDate,
        frequency: existing.frequency,
        intervalCount: existing.intervalCount,
        endDate: existing.endDate,
      });

      const updated = await updateRecurringDraftById(tx, context.organizationId, existing.id, {
        nextRunDate: bumped.nextRunDate,
        status: bumped.status,
        lastGeneratedAt: new Date(),
      });
      if (!updated) throw new NotFoundError('Recurring draft');

      await recordAuditEvent(txContext, {
        action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_GENERATED,
        entityType: 'recurring_financial_draft',
        entityId: existing.id,
        after: {
          generatedEntityType: existing.draftKind,
          generatedEntityId: created.id,
          generatedStatus: 'draft',
          runDate,
          nextRunDate: bumped.nextRunDate,
          posted: false,
          finalized: false,
        },
      });

      return {
        draftId: existing.id,
        runDate,
        generatedEntityType: existing.draftKind,
        generatedEntityId: created.id,
        generatedStatus: 'draft' as const,
        nextRunDate: bumped.nextRunDate,
        templateStatus: bumped.status,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'A draft was already generated for this template today',
        'recurringDrafts.errors.alreadyGeneratedToday',
      );
    }
    throw error;
  }
}
