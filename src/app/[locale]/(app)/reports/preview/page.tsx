import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { generateReport, isReportKind } from '@/modules/reports';
import { ReportPrintButton, ReportPrintView } from '@/modules/reports/ui';
import { AppError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'reports' });
  return { title: t('title') };
}

export default async function ReportPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const params = await searchParams;
  const kind = params.kind ?? '';
  const id = params.id ?? '';
  if (!isReportKind(kind) || !id) notFound();

  const t = await getTranslations('reports');

  let payload;
  try {
    payload = await withOrgContext((context) =>
      generateReport(context, { kind, id, locale: context.locale }),
    );
  } catch (error) {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <ReportPrintButton label={t('print')} />
      </div>
      <ReportPrintView payload={payload} />
    </div>
  );
}
