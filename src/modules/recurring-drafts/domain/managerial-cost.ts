/**
 * Managerial cost attribution for recurring expense templates (true-cost).
 * general_business → overhead (no project); direct_project requires projectId.
 */

import { DomainRuleError } from '@/shared/errors';
import type { ExpenseDraftPayload } from './types';

export const MANAGERIAL_COST_KINDS = ['direct_project', 'general_business'] as const;
export type ManagerialCostKind = (typeof MANAGERIAL_COST_KINDS)[number];

export function isManagerialCostKind(value: string | null | undefined): value is ManagerialCostKind {
  return value != null && (MANAGERIAL_COST_KINDS as readonly string[]).includes(value);
}

/**
 * Apply Owner managerial attribution onto an expense draft payload before create.
 */
export function applyManagerialCostKindToExpensePayload(
  data: ExpenseDraftPayload,
  managerialCostKind: ManagerialCostKind | null | undefined,
): ExpenseDraftPayload {
  if (!managerialCostKind) return data;

  if (managerialCostKind === 'general_business') {
    return {
      ...data,
      projectId: null,
      costFamily: 'business_overhead',
    };
  }

  // direct_project
  const projectId = data.projectId?.trim() || null;
  if (!projectId) {
    throw new DomainRuleError(
      'Direct project recurring expenses require a project',
      'recurringDrafts.errors.directProjectRequiresProject',
    );
  }
  return {
    ...data,
    projectId,
    costFamily: data.costFamily === 'shared' || data.costFamily === 'asset_capital'
      ? data.costFamily
      : 'direct_project',
  };
}
