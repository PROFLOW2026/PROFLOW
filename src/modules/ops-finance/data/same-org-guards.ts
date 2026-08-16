/**
 * APP GUARDS for ops_expense_links - polymorphic ops_record_id + expense same-org.
 */

import { and, eq } from 'drizzle-orm';
import { expenses } from '@drizzle/schema';
import { findAssetById, findFleetById, findMaintenanceById } from '@/modules/assets';
import { findComplianceArtifactById } from '@/modules/compliance';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';
import type { OpsRecordKind } from '../domain/types';

/** APP GUARD: expense_id must belong to the same organization. */
export async function assertExpenseSameOrg(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'Expense does not belong to this organization',
      'opsFinance.errors.expenseOrgMismatch',
    );
  }
}

/**
 * APP GUARD: polymorphic ops_record_id must resolve in-org when loadable.
 * Inventory movements are never accepted (kind rejected earlier).
 */
export async function assertOpsRecordSameOrg(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  opsRecordKind: OpsRecordKind,
  opsRecordId: string,
): Promise<void> {
  const { db, organizationId } = context;
  switch (opsRecordKind) {
    case 'maintenance_record': {
      const record = await findMaintenanceById(db, organizationId, opsRecordId);
      if (!record || record.archivedAt) {
        throw new DomainRuleError(
          'Ops record does not belong to this organization or is not loadable',
          'opsFinance.errors.opsRecordOrgMismatch',
        );
      }
      return;
    }
    case 'compliance_artifact':
    case 'recurring_business_cost': {
      const artifact = await findComplianceArtifactById(db, organizationId, opsRecordId);
      if (!artifact || artifact.archivedAt) {
        throw new DomainRuleError(
          'Ops record does not belong to this organization or is not loadable',
          'opsFinance.errors.opsRecordOrgMismatch',
        );
      }
      return;
    }
    case 'fleet_vehicle': {
      const fleet = await findFleetById(db, organizationId, opsRecordId);
      if (!fleet || fleet.archivedAt) {
        throw new DomainRuleError(
          'Ops record does not belong to this organization or is not loadable',
          'opsFinance.errors.opsRecordOrgMismatch',
        );
      }
      // Ensure fleet's asset is also same-org when present.
      const asset = await findAssetById(db, organizationId, fleet.assetId);
      if (!asset) {
        throw new DomainRuleError(
          'Ops record does not belong to this organization or is not loadable',
          'opsFinance.errors.opsRecordOrgMismatch',
        );
      }
      return;
    }
    default: {
      const _exhaustive: never = opsRecordKind;
      throw new DomainRuleError(
        `Unsupported ops record kind: ${_exhaustive}`,
        'opsFinance.errors.opsRecordOrgMismatch',
      );
    }
  }
}
