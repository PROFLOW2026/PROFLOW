import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SupplierPerformance } from '../domain/supplier-performance';

export async function VendorPerformancePanel({
  performance,
}: {
  readonly performance: SupplierPerformance | null;
}) {
  const t = await getTranslations('vendors.performance');

  if (!performance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        </CardContent>
      </Card>
    );
  }

  const hasFacts =
    performance.totalPurchased ||
    performance.openLiabilities ||
    performance.projectCount != null ||
    performance.poCount != null ||
    performance.fulfillmentLag ||
    performance.billDiscrepancy ||
    performance.warrantyQuality ||
    performance.subcontract ||
    performance.compliance ||
    performance.payment;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasFacts ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {performance.totalPurchased ? (
              <Fact label={t('totalPurchased')} value={<MoneyText value={performance.totalPurchased} />} />
            ) : null}
            {performance.openLiabilities ? (
              <Fact
                label={t('openLiabilities')}
                value={<MoneyText value={performance.openLiabilities} />}
              />
            ) : null}
            {performance.projectCount != null ? (
              <Fact label={t('projects')} value={String(performance.projectCount)} />
            ) : null}
            {performance.poCount != null ? (
              <Fact label={t('poCount')} value={String(performance.poCount)} />
            ) : null}
            {performance.poCommitted ? (
              <Fact label={t('poCommitted')} value={<MoneyText value={performance.poCommitted} />} />
            ) : null}
            {performance.fulfillmentLag ? (
              <Fact
                label={t('fulfillmentLag')}
                value={t('fulfillmentLagValue', {
                  days: performance.fulfillmentLag.averageDays,
                  count: performance.fulfillmentLag.sampleSize,
                })}
              />
            ) : null}
            {performance.billDiscrepancy ? (
              <Fact
                label={t('billDiscrepancy')}
                value={t('billDiscrepancyValue', {
                  discrepancies: performance.billDiscrepancy.discrepancyCount,
                  matched: performance.billDiscrepancy.matchedBillCount,
                })}
              />
            ) : null}
            {performance.warrantyQuality ? (
              <Fact
                label={t('warrantyQuality')}
                value={t('warrantyQualityValue', {
                  open: performance.warrantyQuality.openIssueCount,
                  coverages: performance.warrantyQuality.coverageCount,
                })}
              />
            ) : null}
            <Fact label={t('punch')} value={t('punchUnlinked')} />
            {performance.subcontract ? (
              <Fact
                label={t('subcontract')}
                value={
                  <span className="flex flex-col gap-0.5">
                    <span>{t('subcontractAgreements', { count: performance.subcontract.agreementCount })}</span>
                    <MoneyText value={performance.subcontract.billed} />
                  </span>
                }
              />
            ) : null}
            {performance.compliance ? (
              <Fact
                label={t('compliance')}
                value={t('complianceValue', {
                  valid: performance.compliance.validCount,
                  total: performance.compliance.artifactCount,
                })}
              />
            ) : null}
            {performance.payment ? (
              <Fact
                label={t('payment')}
                value={
                  <span className="flex flex-col gap-0.5">
                    <MoneyText value={performance.payment.paid} />
                    <span className="text-xs text-[var(--pf-text-secondary)]">
                      {t('paymentCount', { count: performance.payment.paymentCount })}
                    </span>
                  </span>
                }
              />
            ) : null}
          </div>
        )}

        {performance.overallScore != null ? (
          <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3">
            <p className="text-sm font-medium">
              {t('overallScore', { score: performance.overallScore })}
            </p>
            <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">
              {t('formula')}
            </p>
            <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-xs text-[var(--pf-text-secondary)]">
              {performance.scoreComponents.map((component) => (
                <li key={component.key}>
                  {t(`components.${component.key}`, {
                    score: component.score,
                    count: component.sampleSize,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('noScore')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
