import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { findTimeEntryById, loadQuickLogFormData } from '@/modules/workforce';
import { assertCanActOnEmployeeTime } from '@/modules/workforce/application/time-scope';
import { TimeEntryForm } from '@/modules/workforce/ui/time-entry-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTimeEntryAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('time.quickLog') };
}

export default async function QuickTimePage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string;
    employeeId?: string;
    correctsEntryId?: string;
  }>;
}) {
  const t = await getTranslations('workforce');
  const query = await searchParams;

  const formData = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.TIME_MANAGE)) {
      throw new AuthorizationError(PERMISSIONS.TIME_MANAGE);
    }

    const loaded = await loadQuickLogFormData(context, {
      projectId: query.projectId,
      employeeId: query.employeeId,
    });

    let correction: {
      correctsEntryId: string;
      initialHours: string;
      initialDescription: string | null;
      initialKind: 'project' | 'non_project';
      initialTimeCodeId: string | null;
      defaultEmployeeId: string;
      recentProjectId: string | null;
      defaultDate: string;
    } | null = null;

    if (query.correctsEntryId) {
      const original = await findTimeEntryById(
        context.db,
        context.organizationId,
        query.correctsEntryId,
      );
      if (!original || original.status !== 'recorded') {
        throw new NotFoundError('Time entry');
      }
      await assertCanActOnEmployeeTime(context, original.employeeId);
      correction = {
        correctsEntryId: original.id,
        initialHours: original.hours,
        initialDescription: original.description,
        initialKind: original.kind,
        initialTimeCodeId: original.timeCodeId,
        defaultEmployeeId: original.employeeId,
        recentProjectId: original.projectId,
        defaultDate: original.workDate,
      };
    }

    return {
      ...loaded,
      defaultDate: correction?.defaultDate ?? todayInTimeZone(context.organization.timezone),
      defaultEmployeeId: correction?.defaultEmployeeId ?? loaded.defaultEmployeeId,
      recentProjectId: correction?.recentProjectId ?? loaded.recentProjectId,
      correctsEntryId: correction?.correctsEntryId ?? null,
      initialHours: correction?.initialHours ?? '',
      initialDescription: correction?.initialDescription ?? null,
      initialKind: correction?.initialKind ?? 'project',
      initialTimeCodeId: correction?.initialTimeCodeId ?? null,
    };
  });

  const description = query.correctsEntryId
    ? t('time.correctionDescription')
    : query.projectId
      ? t('time.quickLogProjectDescription')
      : t('time.quickLogDescription');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={query.correctsEntryId ? t('time.correctionTitle') : t('time.quickLog')}
        description={description}
      />
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
        correctsEntryId={formData.correctsEntryId}
        initialHours={formData.initialHours}
        initialDescription={formData.initialDescription}
        initialKind={formData.initialKind}
        initialTimeCodeId={formData.initialTimeCodeId}
      />
    </div>
  );
}
