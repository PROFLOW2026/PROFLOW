import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { latestCompletedMonth } from '@/modules/command-center';
import { listGeneratedArtifacts } from '@/modules/generated-documents/application/list-artifacts';
import { resolveGeneratedDocumentBinding } from '@/modules/generated-documents/application/resolve-binding';
import { GeneratedDocumentStatus } from '@/modules/generated-documents/ui/generated-document-status';
import { ReportDownloadButtons } from '@/modules/reports/ui';
import { reportPreviewPath } from '@/modules/reports';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { MonthlyWorkforceReportMonthForm } from './month-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce.reports.monthly' });
  return { title: t('title') };
}

export default async function MonthlyWorkforceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations('workforce.reports.monthly');

  const data = await withOrgContext(async (context) => {
    if (
      !hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
      !hasPermission(context, PERMISSIONS.WORKFORCE_READ)
    ) {
      return null;
    }
    const today = todayInTimeZone(context.organization.timezone);
    const defaultMonth = latestCompletedMonth(today);
    const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : defaultMonth;
    const binding = await resolveGeneratedDocumentBinding(
      context,
      'monthly_workforce_report',
      month,
      month,
    );
    const artifacts = await listGeneratedArtifacts(context, {
      ownerType: binding.ownerType,
      ownerId: binding.ownerId,
      generatedKind: 'monthly_workforce_report',
      sourceEntityId: binding.sourceEntityId,
      reportMonth: month,
    });
    return {
      month,
      defaultMonth,
      artifacts,
    };
  });

  if (!data) notFound();

  const previewHref = reportPreviewPath('monthly_workforce_report', data.month);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <WorkforceSubNav active="employees" />
      <PageHeader title={t('title')} description={t('description')} />
      <MonthlyWorkforceReportMonthForm defaultMonth={data.defaultMonth} selectedMonth={data.month} />
      <div className="flex flex-wrap items-center gap-2">
        <ReportDownloadButtons
          kind="monthly_workforce_report"
          id={data.month}
          reportMonth={data.month}
        />
        <Link href={previewHref} className="text-sm text-[var(--pf-text-secondary)] underline">
          {t('openPreview')}
        </Link>
      </div>
      <GeneratedDocumentStatus artifacts={data.artifacts} />
    </div>
  );
}
