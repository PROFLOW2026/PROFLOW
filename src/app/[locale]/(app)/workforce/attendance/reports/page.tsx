import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      <WorkforceSubNav active="attendance" />

      <Link
        href="/workforce/attendance"
        className="w-fit text-sm font-medium text-[var(--pf-text-secondary)] underline-offset-2 hover:underline"
      >
        {t('backToAttendance')}
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('monthlyReportTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceReportMonthForm defaultMonth={defaultMonth} />
        </CardContent>
      </Card>
    </div>
  );
}
