import { contractValueEvents } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { assertOwnerRetroactiveBusinessChange } from '@/shared/business-change/assert-owner-retroactive';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { fromNumericString, money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findContractValueEventByChangeOrderId,
  updateContractValueEventAmount,
} from '@/modules/projects/data/contracts.repository';
import { changeOrderEventAmount } from '../domain/contract-value';
import {
  findChangeOrderById,
  hasFinalizedBillingForChangeOrder,
  updateChangeOrderRetroactiveFields,
} from '../data/quotes.repository';
import {
  editChangeOrderRetroactiveSchema,
  type EditChangeOrderRetroactiveInput,
} from '../validation/schemas';
import type { ChangeOrderRecord } from '../domain/types';

function amountsDiffer(before: string, after: string, currency: string): boolean {
  try {
    return money(before, currency).amount !== money(after, currency).amount;
  } catch {
    return before.trim() !== after.trim();
  }
}

export async function editChangeOrderRetroactive(
  context: OrgContext,
  rawInput: EditChangeOrderRetroactiveInput,
): Promise<ChangeOrderRecord> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const parsed = editChangeOrderRetroactiveSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertOwnerRetroactiveBusinessChange(
    context,
    input.changeAcknowledged,
    'changes.errors.ownerOnlyRetroactiveEdit',
  );

  const existing = await findChangeOrderById(
    context.db,
    context.organizationId,
    input.changeOrderId,
  );
  if (!existing) throw new NotFoundError('Change order');
  if (existing.reversalOfChangeOrderId) {
    throw new DomainRuleError(
      'Reversal change orders cannot be edited',
      'changes.errors.changeOrderNotEditable',
    );
  }

  const amountChanging =
    input.amount !== undefined &&
    input.amount !== null &&
    amountsDiffer(existing.amount, input.amount, existing.currency);

  if (amountChanging && input.amountChangeAcknowledged !== true) {
    throw new ValidationError([
      { path: 'amountChangeAcknowledged', message: 'errors.confirmRequired' },
    ]);
  }

  const effectiveDateChanging =
    input.effectiveDate !== undefined &&
    input.effectiveDate !== null &&
    input.effectiveDate !== existing.effectiveDate;

  return withTransaction(context.db, async (tx) => {
    if (amountChanging) {
      const billed = await hasFinalizedBillingForChangeOrder(
        tx,
        context.organizationId,
        existing.id,
      );
      if (billed) {
        throw new ConflictError(
          'Cannot change amount on a change order with finalized billing',
          'changes.errors.unsafeBilling',
        );
      }
    }

    const nextAmount =
      input.amount !== undefined && input.amount !== null ? input.amount : undefined;

    const updated = await updateChangeOrderRetroactiveFields(
      tx,
      context.organizationId,
      existing.id,
      {
        reference: input.reference,
        effectiveDate: input.effectiveDate === null ? undefined : input.effectiveDate,
        notes: input.notes,
        billingCondition: input.billingCondition === null ? undefined : input.billingCondition,
        amount: nextAmount,
      },
    );
    if (!updated) throw new NotFoundError('Change order');

    if (amountChanging || effectiveDateChanging) {
      const event = await findContractValueEventByChangeOrderId(
        tx,
        context.organizationId,
        existing.id,
      );
      if (!event) {
        throw new DomainRuleError(
          'Contract value event missing for change order',
          'changes.errors.noContract',
        );
      }

      if (amountChanging && nextAmount) {
        const magnitude = fromNumericString(nextAmount, existing.currency);
        if (!magnitude) {
          throw new ValidationError([{ path: 'amount', message: 'Invalid amount' }]);
        }
        const signed = changeOrderEventAmount(existing.direction, magnitude);
        await updateContractValueEventAmount(tx, context.organizationId, event.id, {
          amount: toNumericString(signed),
        });
      }

      if (effectiveDateChanging && input.effectiveDate) {
        await tx
          .update(contractValueEvents)
          .set({ effectiveDate: input.effectiveDate })
          .where(
            and(
              eq(contractValueEvents.id, event.id),
              eq(contractValueEvents.organizationId, context.organizationId),
            ),
          );
      }
    }

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CHANGE_ORDER_CREATED,
      entityType: 'change_order',
      entityId: updated.id,
      before: {
        correctionKind: 'owner_retroactive',
        reference: existing.reference,
        effectiveDate: existing.effectiveDate,
        notes: existing.notes,
        billingCondition: existing.billingCondition,
        amount: existing.amount,
      },
      after: {
        correctionKind: 'owner_retroactive',
        reference: updated.reference,
        effectiveDate: updated.effectiveDate,
        notes: updated.notes,
        billingCondition: updated.billingCondition,
        amount: updated.amount,
        amountCorrected: amountChanging,
      },
    });

    return updated;
  });
}
