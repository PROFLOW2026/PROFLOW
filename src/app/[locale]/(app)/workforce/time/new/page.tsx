import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadQuickLogFormData } from '@/modules/workforce';
import { TimeEntryForm } from '@/modules/workforce/ui/time-entry-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { AuthorizationError } from '@/shared/errors';
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
  searchParams: Promise<{ projectId?: string; employeeId?: string }>;
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

    return {
      ...loaded,
      defaultDate: todayInTimeZone(context.organization.timezone),
    };
  });

  const description = query.projectId
    ? t('time.quickLogProjectDescription')
    : t('time.quickLogDescription');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('time.quickLog')} description={description} />
      <TimeEntryForm action={createTimeEntryAction} {...formData} />
    </div>
  );
}
