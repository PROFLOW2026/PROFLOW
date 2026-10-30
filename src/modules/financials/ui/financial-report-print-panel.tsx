import { getTranslations } from 'next-intl/server';
import { MainAppListToolbar } from '@/components/patterns/main-app';
import type { ReportPayload } from '@/modules/reports/domain/types';
import { ReportBrandedPreview } from '@/modules/reports/ui/report-branded-preview';
import { ReportPrintButton } from '@/modules/reports/ui/report-print-button';

/** Full-data print/PDF via shared report HTML renderer (iframe print). */
export async function FinancialReportPrintPanel({ payload }: { readonly payload: ReportPayload }) {
  const t = await getTranslations('reports');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <MainAppListToolbar className="print:hidden">
        <ReportPrintButton label={t('print')} />
      </MainAppListToolbar>
      <div className="pf-financial-report-print-frame print:hidden" aria-hidden>
        <ReportBrandedPreview payload={payload} />
      </div>
    </div>
  );
}
