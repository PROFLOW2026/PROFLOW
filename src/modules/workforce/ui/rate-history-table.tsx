import { getTranslations } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import type { RateVersionDetail } from '@/modules/workforce';
import { fromNumericString } from '@/shared/money';

interface RateHistoryTableProps {
  readonly versions: readonly RateVersionDetail[];
}

export async function RateHistoryTable({ versions }: RateHistoryTableProps) {
  const t = await getTranslations('workforce');

  if (versions.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('employees.detail.noRateHistory')}</p>;
  }

  return (
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
            <TableCell>{version.validFrom}</TableCell>
            <TableCell>{version.validTo ?? t('employees.detail.openEnded')}</TableCell>
            <TableCell>{t(`rateUnits.${version.rateUnit}`)}</TableCell>
            <TableCell numeric>
              <MoneyText
                value={fromNumericString(version.baseRate, version.currency) ?? {
                  amount: version.baseRate,
                  currency: version.currency,
                }}
              />
            </TableCell>
            <TableCell numeric>{version.burdenPercent ? `${version.burdenPercent}%` : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
