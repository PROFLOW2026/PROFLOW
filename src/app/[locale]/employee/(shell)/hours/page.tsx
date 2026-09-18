import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { resolveSelfScopedEmployeeId } from '@/modules/workforce/application/time-scope';
import { listTimeEntries } from '@/modules/workforce';
import { Link } from '@/shared/i18n/navigation';

export default async function EmployeeHoursPage() {
  const t = await getTranslations('workforce');
  const tLists = await getTranslations('employeeApp.lists');
  const entries = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.TIME_MANAGE, scope: 'self_only' });
    const employeeId = await resolveSelfScopedEmployeeId(context);
    if (!employeeId) return [];
    const result = await listTimeEntries(context.db, context.organizationId, {
      employeeId,
    });
    return result.slice(0, 50).map((item) => ({
      id: item.id,
      workDate: item.workDate,
      hours: item.hours,
      projectId: item.projectId,
    }));
  });

  return (
    <div className="space-y-4">
      <Button asChild size="lg" block>
        <Link href="/employee/hours/new">{t('attendance.clock.logHoursLink')}</Link>
      </Button>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{entry.workDate}</span>
            <span>{entry.hours}h</span>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {tLists('hoursEmpty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
