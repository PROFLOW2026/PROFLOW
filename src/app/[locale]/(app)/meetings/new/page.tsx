import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { MeetingForm } from '../meeting-form';
import { loadMeetingPickerData } from '../load-form-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.createMeetingTitle') };
}

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; workspace?: string }>;
}) {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_MANAGE)) {
    notFound();
  }

  const [params, t] = await Promise.all([searchParams, getTranslations('tasks')]);
  const { projects, workspaces } = await withOrgContext(loadMeetingPickerData);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.createMeetingTitle')}
        description={t('meetings.pageDescription')}
        breadcrumb={
          <Link href="/meetings" className={textNavLinkMutedClassName}>
            {t('meetings.pageTitle')}
          </Link>
        }
      />
      <MeetingForm
        mode="create"
        projects={projects}
        workspaces={workspaces}
        defaultScheduledAt={new Date()}
        defaultProjectId={params.project}
        defaultWorkspaceId={params.workspace}
      />
    </div>
  );
}
