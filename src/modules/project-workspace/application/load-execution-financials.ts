import 'server-only';

import { sql } from 'drizzle-orm';
import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';

/** Latest payable basis per claim, summed for one currency. Empty or mixed currencies stay null. */
export interface ExecutionPayableTotals {
  readonly currency: string;
  readonly certified: string;
  readonly retention: string;
  readonly advances: string;
  readonly deductions: string;
  readonly payableNet: string;
}

function sqlRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return ((result as { rows?: Record<string, unknown>[] } | null)?.rows ?? []) as Record<string, unknown>[];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '0' : String(value);
}

/**
 * One project-scoped aggregate. Not loaded unless the viewer holds payment.view.
 * Uses the latest payable-basis version per claim so history is not double-counted.
 */
export async function loadExecutionPayableTotals(
  context: OrgContext,
  projectId: string,
): Promise<ExecutionPayableTotals | null> {
  const held = await loadProjectCapabilities(context, projectId);
  if (!held.has(C.PAYMENT_VIEW)) return null;

  try {
    const result = await context.db.execute(sql`
      select currency,
             sum(certified_total) as certified,
             sum(retention_amount) as retention,
             sum(advance_recovery_amount) as advances,
             sum(deductions_amount) as deductions,
             sum(payable_net) as payable_net
      from (
        select distinct on (claim_id)
          currency,
          certified_total,
          retention_amount,
          advance_recovery_amount,
          deductions_amount,
          payable_net
        from subcontract_claim_payable_bases
        where organization_id = ${context.organizationId}::uuid
          and project_id = ${projectId}::uuid
        order by claim_id, version desc
      ) latest
      group by currency
    `);
    const rows = sqlRows(result);
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    return {
      currency: text(row.currency).toUpperCase(),
      certified: text(row.certified),
      retention: text(row.retention),
      advances: text(row.advances),
      deductions: text(row.deductions),
      payableNet: text(row.payable_net),
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === '42501' || code === '42P01') return null;
    throw error;
  }
}
