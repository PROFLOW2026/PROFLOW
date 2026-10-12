'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  ExportDownloadToast,
  useExportDownload,
} from '@/modules/exports/ui/export-download-control';

type FinancialYearBookExportProps = {
  readonly defaultYear: number;
  readonly minYear: number;
  readonly maxYear: number;
};

export function FinancialYearBookExport({
  defaultYear,
  minYear,
  maxYear,
}: FinancialYearBookExportProps) {
  const t = useTranslations('dashboard.reports');
  const download = useExportDownload();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) list.push(y);
    return list;
  }, [minYear, maxYear]);
  const [year, setYear] = useState(String(defaultYear));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
        <span className="sr-only">{t('financialYearBookYear')}</span>
        <select
          className="min-h-11 rounded-md border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 text-sm"
          value={year}
          disabled={download.busy}
          onChange={(event) => setYear(event.target.value)}
          aria-label={t('financialYearBookYear')}
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="min-h-11"
        disabled={download.busy}
        loading={download.busy}
        onClick={() => {
          void download.run(`/exports/financial-year-book?year=${encodeURIComponent(year)}`);
        }}
      >
        {t('financialYearBookExport')}
      </Button>
      <ExportDownloadToast feedback={download} />
    </div>
  );
}
