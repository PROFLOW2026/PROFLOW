import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getMeetingDetailById } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { DecisionForm } from '../../../../decision-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string; decisionId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.editDecisionTitle') };
}

export default async function EditDecisionPage({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string; decisionId: string }>;
}) {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_MANAGE)) {
    notFound();
  }

  const { meetingId, decisionId } = await params;
  const t = await getTranslations('tasks');

  const meeting = await withOrgContext((context) => getMeetingDetailById(context, meetingId));
  const decision = meeting.decisions.find((row) => row.id === decisionId);
  if (!decision) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.editDecisionTitle')}
        description={meeting.title}
        breadcrumb={
          <Link href={`/meetings/${meetingId}`} className={textNavLinkMutedClassName}>
            {t('meetings.pageTitle')}
          </Link>
        }
      />
      <DecisionForm mode="edit" meetingId={meetingId} decision={decision} />
    </div>
  );
}
