import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { MeetingForm } from '@/app/[locale]/(app)/meetings/meeting-form';
import { loadMeetingPickerData } from '@/app/[locale]/(app)/meetings/load-form-data';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { employeeCreateMeetingAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.createMeetingTitle') };
}

export default async function EmployeeNewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; workspace?: string }>;
}) {
  const allowed = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return employeeHasPermission(context, PERMISSIONS.MEETINGS_MANAGE);
  });

  if (!allowed) notFound();

  const [params, t, picker] = await Promise.all([
    searchParams,
    getTranslations('tasks'),
    withOrgContext(loadMeetingPickerData),
  ]);

  return (
    <WithAppClientMessages extra={['tasks']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('meetings.form.createMeetingTitle')}
          description={t('meetings.pageDescription')}
          breadcrumb={
            <Link href="/employee/meetings" className={textNavLinkMutedClassName}>
              {t('meetings.pageTitle')}
            </Link>
          }
        />
        <MeetingForm
          mode="create"
          projects={picker.projects}
          workspaces={picker.workspaces}
          defaultScheduledAt={new Date()}
          defaultProjectId={params.project}
          defaultWorkspaceId={params.workspace}
          createAction={employeeCreateMeetingAction}
        />
      </div>
    </WithAppClientMessages>
  );
}
