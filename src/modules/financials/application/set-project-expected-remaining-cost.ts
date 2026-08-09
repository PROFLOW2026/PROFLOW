import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { money } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertProjectInOrg,
  findProjectForecastInputs,
  updateProjectExpectedRemainingCost,
} from '../data/projects.repository';

/**
 * Persist uncovenanted expected remaining cost (ETC) for forecast final cost.
 * Pass null to clear. Does not touch committed_costs / AP.
 */
export async function setProjectExpectedRemainingCost(
  context: OrgContext,
  projectId: string,
  amount: string | null,
): Promise<{ expectedRemainingCostAmount: string | null; currency: string }> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const { currency } = await findProjectForecastInputs(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );

  let normalized: string | null = null;
  if (amount != null && amount.trim() !== '') {
    try {
      const value = money(amount, currency);
      if (value.amount.startsWith('-')) {
        throw new ValidationError([
          { path: 'expectedRemainingCostAmount', message: 'Must be non-negative' },
        ]);
      }
      normalized = value.amount;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError([
        { path: 'expectedRemainingCostAmount', message: 'Invalid money amount' },
      ]);
    }
  }

  const updated = await updateProjectExpectedRemainingCost(
    context.db,
    context.organizationId,
    projectId,
    normalized,
  );
  if (!updated) throw new NotFoundError('Project');

  return { expectedRemainingCostAmount: normalized, currency };
}
