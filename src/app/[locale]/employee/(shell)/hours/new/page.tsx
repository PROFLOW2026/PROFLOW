import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createTimeEntryAction } from '@/app/[locale]/(app)/workforce/time/actions';
import { loadQuickLogFormData } from '@/modules/workforce';
import { getLaborCostDefaultsForApply } from '@/modules/tenancy';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';
import { TimeEntryForm } from '@/modules/workforce/ui/time-entry-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('time.quickLog') };
}

export default async function EmployeeHoursNewPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; taskId?: string }>;
}) {
  const query = await searchParams;
  const t = await getTranslations('workforce');

  const formData = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.TIME_MANAGE, scope: 'self_only' });
    const loaded = await loadQuickLogFormData(context, {
      projectId: query.projectId,
    });
    return {
      ...loaded,
      defaultDate: todayInTimeZone(context.organization.timezone),
      defaultWeekdays: resolveOrgWorkWeekdays(
        await getLaborCostDefaultsForApply(context).catch(() => null),
      ),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('time.quickLogDescription')}</p>
      <TimeEntryForm
        action={createTimeEntryAction}
        employees={formData.employees}
        projects={formData.projects}
        timeCodes={formData.timeCodes}
        defaultEmployeeId={formData.defaultEmployeeId}
        defaultDate={formData.defaultDate}
        recentProjectId={formData.recentProjectId}
        assignedEmployeeIds={formData.assignedEmployeeIds}
        employeeLocked={formData.selfScoped}
        defaultWeekdays={formData.defaultWeekdays}
        canApproveOnCreate={false}
        returnPath="/employee/hours"
        defaultTaskId={query.taskId ?? null}
      />
    </div>
  );
}
