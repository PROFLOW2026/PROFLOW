import {
  MainAppPage,
  MainAppReportWorkspace,
  MainAppSection,
} from '@/components/patterns/main-app';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { canManageAttendanceRecords } from '@/modules/workforce';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { AttendanceReportMonthForm } from './attendance-report-month-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce.attendance.reports' });
  return { title: t('title') };
}

export default async function AttendanceReportsPage() {
  const t = await getTranslations('workforce.attendance.reports');

  const defaultMonth = await withOrgContext(async (context) => {
    if (!canManageAttendanceRecords(context)) {
      return null;
    }
    return todayInTimeZone(context.organization.timezone).slice(0, 7);
  });

  if (!defaultMonth) notFound();

  return (
    <MainAppPage>
      <PageHeader title={t('title')} description={t('description')} />
      <MainAppReportWorkspace
        catalog={null}
        panel={
          <>
            <WorkforceSubNav active="attendance" />

            <Link
              href="/workforce/attendance"
              className="w-fit text-sm font-medium text-[var(--pf-text-secondary)] underline-offset-2 hover:underline"
            >
              {t('backToAttendance')}
            </Link>

            <MainAppSection title={t('monthlyReportTitle')} className="max-w-3xl">
              <AttendanceReportMonthForm defaultMonth={defaultMonth} />
            </MainAppSection>
          </>
        }
      />
    </MainAppPage>
  );
}
