import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getMeetingDetailById } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { ActionItemForm } from '../../../action-item-form';
import { loadAssigneePickerData } from '../../../load-form-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.addActionItemTitle') };
}

export default async function NewActionItemPage({
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

  const { meeting, members, employees } = await withOrgContext(async (context) => {
    const detail = await getMeetingDetailById(context, meetingId);
    const pickers = await loadAssigneePickerData(context);
    return { meeting: detail, ...pickers };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.addActionItemTitle')}
        description={meeting.title}
        breadcrumb={
          <Link href={`/meetings/${meetingId}`} className={textNavLinkMutedClassName}>
            {t('meetings.pageTitle')}
          </Link>
        }
      />
      <ActionItemForm
        mode="create"
        meetingId={meetingId}
        decisions={meeting.decisions.map((decision) => ({
          id: decision.id,
          title: decision.title,
        }))}
        members={members}
        employees={employees}
      />
    </div>
  );
}
