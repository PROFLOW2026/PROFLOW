import type { BusinessDate } from '@/shared/dates';
import { listGeneratedArtifacts } from '@/modules/generated-documents/application/list-artifacts';
import { resolveGeneratedDocumentBinding } from '@/modules/generated-documents/application/resolve-binding';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withItemDefaults } from '../domain/ranking';
import { monthlyWorkforceReportReadyCopy } from '../domain/item-copy';
import type { CommandCenterItem } from '../domain/types';
import type { CollectContext } from './collect-sources';

/**
 * The most recently completed calendar month (YYYY-MM).
 * While still inside month M, the latest completed month is M-1 (offered from the 1st of M).
 */
export function latestCompletedMonth(today: BusinessDate): string {
  const parts = today.split('-');
  let year = Number(parts[0]);
  let month = Number(parts[1]);
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function collectMonthlyWorkforceReportReady(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  const { context, today } = ctx;
  if (
    !hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
    !hasPermission(context, PERMISSIONS.WORKFORCE_READ)
  ) {
    return [];
  }

  const completedMonth = latestCompletedMonth(today);

  if (hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    try {
      const binding = await resolveGeneratedDocumentBinding(
        context,
        'monthly_workforce_report',
        completedMonth,
        completedMonth,
      );
      const existing = await listGeneratedArtifacts(context, {
        ownerType: binding.ownerType,
        ownerId: binding.ownerId,
        generatedKind: 'monthly_workforce_report',
        sourceEntityId: binding.sourceEntityId,
        reportMonth: completedMonth,
      });
      if (existing.length > 0) {
        return [];
      }
    } catch {
      // Missing workforce month data — still offer the prompt.
    }
  }

  const copy = monthlyWorkforceReportReadyCopy(ctx.copyScope, completedMonth);
  return [
    withItemDefaults({
      sourceType: 'monthly_workforce_report_ready',
      sourceId: completedMonth,
      what: copy.what,
      why: copy.why,
      where: copy.where,
      href: `/workforce/reports/monthly?month=${completedMonth}`,
      severity: 'low',
      urgencyBump: 0,
      meta: { reportMonth: completedMonth },
    }),
  ];
}
