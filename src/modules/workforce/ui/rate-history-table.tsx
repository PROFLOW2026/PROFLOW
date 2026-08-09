import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { MoneyText } from '@/components/patterns/money-text';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import type { RateVersionDetail } from '@/modules/workforce';
import { fromNumericString } from '@/shared/money';

interface RateHistoryTableProps {
  readonly versions: readonly RateVersionDetail[];
}

export async function RateHistoryTable({ versions }: RateHistoryTableProps) {
  const t = await getTranslations('workforce');

  if (versions.length === 0) {
    return <EmptyState size="sm" title={t('employees.detail.noRateHistory')} className="py-6" />;
  }

  return (
    <ResponsiveTable
      items={versions}
      getRowKey={(version) => version.id}
      desktop={
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('employees.detail.rateFrom')}</TableHead>
                <TableHead>{t('employees.detail.rateTo')}</TableHead>
                <TableHead>{t('employees.columns.employmentStyle')}</TableHead>
                <TableHead numeric>{t('employees.columns.currentRate')}</TableHead>
                <TableHead numeric>{t('employees.form.burdenPercent')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <span dir="ltr">{version.validFrom}</span>
                  </TableCell>
                  <TableCell>
                    {version.validTo ? <span dir="ltr">{version.validTo}</span> : t('employees.detail.openEnded')}
                  </TableCell>
                  <TableCell>{t(`rateUnits.${version.rateUnit}`)}</TableCell>
                  <TableCell numeric>
                    <MoneyText
                      value={fromNumericString(version.baseRate, version.currency) ?? {
                        amount: version.baseRate,
                        currency: version.currency,
                      }}
                    />
                  </TableCell>
                  <TableCell numeric>
                    {version.burdenPercent ? (
                      <span dir="ltr" className="pf-numeric">
                        {version.burdenPercent}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(version) => (
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
          <p className="text-start text-sm font-medium">{t(`rateUnits.${version.rateUnit}`)}</p>
          <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]" dir="ltr">
            {version.validFrom}
            {' → '}
            {version.validTo ?? t('employees.detail.openEnded')}
          </p>
          <p className="mt-2 text-start text-sm">
            <MoneyText
              value={fromNumericString(version.baseRate, version.currency) ?? {
                amount: version.baseRate,
                currency: version.currency,
              }}
            />
            {version.burdenPercent ? (
              <span className="ms-2 text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                +{version.burdenPercent}%
              </span>
            ) : null}
          </p>
        </div>
      )}
    />
  );
}
