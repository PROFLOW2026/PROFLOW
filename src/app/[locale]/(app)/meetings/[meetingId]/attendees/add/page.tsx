import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getMeetingDetailById } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { AttendeeForm } from '../../../attendee-form';
import { loadAttendeePickerData } from '../../../load-form-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.addAttendeeTitle') };
}

export default async function AddAttendeePage({
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

  const { meeting, members, employees, contacts } = await withOrgContext(async (context) => {
    const detail = await getMeetingDetailById(context, meetingId);
    const pickers = await loadAttendeePickerData(context);
    return { meeting: detail, ...pickers };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.addAttendeeTitle')}
        description={t('meetings.form.addAttendeeDescription')}
        breadcrumb={
          <Link href={`/meetings/${meetingId}`} className={textNavLinkMutedClassName}>
            {meeting.title}
          </Link>
        }
      />
      <AttendeeForm
        meetingId={meetingId}
        members={members}
        employees={employees}
        contacts={contacts}
      />
    </div>
  );
}
