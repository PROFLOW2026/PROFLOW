import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getMeetingDetailById } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { DecisionForm } from '../../../decision-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.addDecisionTitle') };
}

export default async function NewDecisionPage({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}) {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_MANAGE)) {
    notFound();
  }

  const { meetingId } = await params;
  const t = await getTranslations('tasks');
  const meeting = await withOrgContext((context) => getMeetingDetailById(context, meetingId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.addDecisionTitle')}
        description={meeting.title}
        breadcrumb={
          <Link href={`/meetings/${meetingId}`} className={textNavLinkMutedClassName}>
            {t('meetings.pageTitle')}
          </Link>
        }
      />
      <DecisionForm mode="create" meetingId={meetingId} />
    </div>
  );
}
