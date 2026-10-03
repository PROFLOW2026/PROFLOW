import { getLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import type { AgreementFinancialView, AgreementOperationalView, WorkLineView } from '../domain/types';

interface Option {
  readonly id: string;
  readonly name: string;
}

/**
 * Work lines (responsive: table on md+, cards on mobile). Money columns render only when the
 * server passed `financial` data - operational callers never receive it.
 */
export async function WorkLinesPanel({
  lines,
  locations,
  workPackages,
  renderLineActions,
}: {
  lines: readonly WorkLineView[];
  locations: readonly Option[];
  workPackages: readonly Option[];
  renderLineActions?: (line: WorkLineView) => React.ReactNode;
}) {
  const t = await getTranslations('subcontracts');
  const locale = await getLocale();
  const showMoney = lines.some((line) => line.financial);
  const locationName = new Map(locations.map((location) => [location.id, location.name]));
  const packageName = new Map(workPackages.map((pkg) => [pkg.id, pkg.name]));
  const money = (amount: string | undefined, currency: string | undefined) =>
    amount && currency ? bidiIsolate(formatMoneyString(amount, currency, locale)) : '';
  const qty = (value: string) => bidiIsolate(String(Number(value)));

  if (lines.length === 0) {
    return <EmptyState size="sm" title={t('lines.emptyTitle')} description={t('lines.emptyDescription')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('lines.fields.code')}</TableHead>
              <TableHead>{t('lines.fields.description')}</TableHead>
              <TableHead>{t('lines.fields.lineType')}</TableHead>
              <TableHead>{t('lines.fields.quantity')}</TableHead>
              <TableHead>{t('lines.fields.location')}</TableHead>
              <TableHead>{t('lines.fields.planned')}</TableHead>
              {showMoney ? (
                <>
                  <TableHead>{t('lines.fields.unitPrice')}</TableHead>
                  <TableHead>{t('lines.fields.baseline')}</TableHead>
                  <TableHead>{t('lines.fields.approvedChanges')}</TableHead>
                  <TableHead>{t('lines.fields.revised')}</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.code ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{line.description}</span>
                    {!line.isBaseline ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">{t('lines.fromChange')}</span>
                    ) : null}
                    {line.workPackageId ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">{packageName.get(line.workPackageId)}</span>
                    ) : null}
                    {renderLineActions ? renderLineActions(line) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {t(`lineTypes.${line.lineType}`)}
                  {line.weightPercent ? ` · ${bidiIsolate(`${Number(line.weightPercent)}%`)}` : ''}
                </TableCell>
                <TableCell>
                  {qty(line.financial?.revisedQuantity ?? line.quantity)} {line.unit}
                </TableCell>
                <TableCell>{line.locationId ? (locationName.get(line.locationId) ?? '—') : '—'}</TableCell>
                <TableCell>
                  {line.plannedStart || line.plannedEnd
                    ? bidiIsolate(`${line.plannedStart ?? '…'} – ${line.plannedEnd ?? '…'}`)
                    : '—'}
                </TableCell>
                {showMoney ? (
                  <>
                    <TableCell numeric>{money(line.financial?.unitPrice, line.financial?.currency)}</TableCell>
                    <TableCell numeric>{money(line.financial?.contractBaselineAmount, line.financial?.currency)}</TableCell>
                    <TableCell numeric>{money(line.financial?.approvedChangesAmount, line.financial?.currency)}</TableCell>
                    <TableCell numeric>{money(line.financial?.revisedAmount, line.financial?.currency)}</TableCell>
                  </>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {lines.map((line) => (
          <li key={line.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{line.description}</p>
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {[line.code, t(`lineTypes.${line.lineType}`), line.locationId ? locationName.get(line.locationId) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span className="shrink-0 text-sm">
                {qty(line.financial?.revisedQuantity ?? line.quantity)} {line.unit}
              </span>
            </div>
            {line.financial ? (
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <dt className="text-[var(--pf-text-muted)]">{t('lines.fields.baseline')}</dt>
                <dd>{money(line.financial.contractBaselineAmount, line.financial.currency)}</dd>
                <dt className="text-[var(--pf-text-muted)]">{t('lines.fields.approvedChanges')}</dt>
                <dd>{money(line.financial.approvedChangesAmount, line.financial.currency)}</dd>
                <dt className="text-[var(--pf-text-muted)]">{t('lines.fields.revised')}</dt>
                <dd className="font-medium">{money(line.financial.revisedAmount, line.financial.currency)}</dd>
              </dl>
            ) : null}
            {renderLineActions ? <div className="mt-2">{renderLineActions(line)}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contract value summary (financial callers only). */
export async function AgreementValueCard({
  financial,
  showTerms,
}: {
  financial: Pick<AgreementFinancialView, 'currency' | 'originalAmount' | 'approvedChangesAmount' | 'currentAmount'> &
    Partial<AgreementFinancialView>;
  showTerms: boolean;
}) {
  const t = await getTranslations('subcontracts');
  const locale = await getLocale();
  const money = (amount: string | null | undefined) =>
    amount ? bidiIsolate(formatMoneyString(amount, financial.currency, locale)) : '—';
  const percent = (value: string | null | undefined) => (value ? bidiIsolate(`${Number(value)}%`) : '—');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('value.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('value.original')}</dt>
            <dd className="text-lg font-semibold">{money(financial.originalAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('value.approvedChanges')}</dt>
            <dd className="text-lg font-semibold">{money(financial.approvedChangesAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('value.current')}</dt>
            <dd className="text-lg font-semibold">{money(financial.currentAmount)}</dd>
          </div>
        </dl>
        {showTerms ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <dt className="text-[var(--pf-text-muted)]">{t('terms.retentionPercent')}</dt>
            <dd>{percent(financial.retentionPercent)}</dd>
            <dt className="text-[var(--pf-text-muted)]">{t('terms.retentionCapAmount')}</dt>
            <dd>{money(financial.retentionCapAmount)}</dd>
            <dt className="text-[var(--pf-text-muted)]">{t('terms.advancePercent')}</dt>
            <dd>{percent(financial.advancePercent)}</dd>
            <dt className="text-[var(--pf-text-muted)]">{t('terms.advanceRecoveryMethod')}</dt>
            <dd>{financial.advanceRecoveryMethod ? t(`advanceRecovery.${financial.advanceRecoveryMethod}`) : '—'}</dd>
            <dt className="text-[var(--pf-text-muted)]">{t('terms.vatTreatment')}</dt>
            <dd>{financial.vatTreatment ? t(`vat.${financial.vatTreatment}`) : '—'}</dd>
            <dt className="text-[var(--pf-text-muted)]">{t('terms.paymentTermsDays')}</dt>
            <dd>{financial.paymentTermsDays ?? '—'}</dd>
          </dl>
        ) : null}
        <p className="mt-3 text-xs text-[var(--pf-text-muted)]">{t('value.netNote')}</p>
      </CardContent>
    </Card>
  );
}

/** Operational agreement facts (no money). */
export async function AgreementFacts({ agreement }: { agreement: AgreementOperationalView }) {
  const t = await getTranslations('subcontracts');
  const facts: [string, string | null][] = [
    [t('agreement.fields.vendor'), agreement.vendorName],
    [t('agreement.fields.number'), agreement.subcontractNumber],
    [t('agreement.fields.trade'), agreement.trade],
    [
      t('agreement.fields.period'),
      agreement.startDate || agreement.endDate ? bidiIsolate(`${agreement.startDate ?? '…'} – ${agreement.endDate ?? '…'}`) : null,
    ],
  ];
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {facts.map(([label, valueText]) => (
        <div key={label}>
          <dt className="text-xs text-[var(--pf-text-muted)]">{label}</dt>
          <dd className="break-words">{valueText ?? '—'}</dd>
        </div>
      ))}
      {agreement.status === 'suspended' && agreement.suspensionReason ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('lifecycle.suspensionReason')}</dt>
          <dd>{agreement.suspensionReason}</dd>
        </div>
      ) : null}
      {agreement.scopeSummary ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('agreement.fields.scope')}</dt>
          <dd className="whitespace-pre-line">{agreement.scopeSummary}</dd>
        </div>
      ) : null}
    </dl>
  );
}
