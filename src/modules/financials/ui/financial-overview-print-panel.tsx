import { getTranslations } from 'next-intl/server';
import type { ReportPayload } from '@/modules/reports/domain/types';
import { ReportBrandedPreview } from '@/modules/reports/ui/report-branded-preview';
import {
  FINANCIAL_OVERVIEW_DETAILED_FRAME_ID,
  FINANCIAL_OVERVIEW_SHORT_FRAME_ID,
  FinancialOverviewPrintActions,
} from './financial-overview-print-actions';

/** Overview-only: short (existing) and detailed report print/PDF targets. */
export async function FinancialOverviewPrintPanel({
  shortPayload,
  detailedPayload,
}: {
  readonly shortPayload: ReportPayload;
  readonly detailedPayload: ReportPayload;
}) {
  const t = await getTranslations('financial.overview.printActions');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FinancialOverviewPrintActions
        menuLabel={t('menu')}
        shortLabel={t('short')}
        detailedLabel={t('detailed')}
      />
      <div className="pf-financial-report-print-frame print:hidden" aria-hidden>
        <ReportBrandedPreview payload={shortPayload} frameId={FINANCIAL_OVERVIEW_SHORT_FRAME_ID} />
        <ReportBrandedPreview
          payload={detailedPayload}
          frameId={FINANCIAL_OVERVIEW_DETAILED_FRAME_ID}
        />
      </div>
    </div>
  );
}
