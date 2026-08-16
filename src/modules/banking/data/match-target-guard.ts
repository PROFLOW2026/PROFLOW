/**
 * Same-org APP GUARD for polymorphic bank match targets.
 * No cross-table FK exists for target_id - validate organization_id in app.
 */

import { and, eq } from 'drizzle-orm';
import { apBills, apPayments, billingRecords, payments } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';
import type { BankMatchTargetKind } from '../domain/types';

export async function assertBankMatchTargetInOrganization(
  db: DbExecutor,
  organizationId: string,
  targetKind: BankMatchTargetKind,
  targetId: string,
): Promise<void> {
  let found = false;

  switch (targetKind) {
    case 'customer_payment': {
      const [row] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.id, targetId), eq(payments.organizationId, organizationId)))
        .limit(1);
      found = Boolean(row);
      break;
    }
    case 'billing_record': {
      const [row] = await db
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(
          and(eq(billingRecords.id, targetId), eq(billingRecords.organizationId, organizationId)),
        )
        .limit(1);
      found = Boolean(row);
      break;
    }
    case 'vendor_payment': {
      const [row] = await db
        .select({ id: apPayments.id })
        .from(apPayments)
        .where(and(eq(apPayments.id, targetId), eq(apPayments.organizationId, organizationId)))
        .limit(1);
      found = Boolean(row);
      break;
    }
    case 'vendor_bill': {
      const [row] = await db
        .select({ id: apBills.id })
        .from(apBills)
        .where(and(eq(apBills.id, targetId), eq(apBills.organizationId, organizationId)))
        .limit(1);
      found = Boolean(row);
      break;
    }
    default: {
      const _exhaustive: never = targetKind;
      void _exhaustive;
      found = false;
    }
  }

  if (!found) {
    throw new DomainRuleError(
      'Match target must belong to the same organization',
      'banking.errors.crossOrgTarget',
    );
  }
}
