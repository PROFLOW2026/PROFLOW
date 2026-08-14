'use client';

import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { money } from '@/shared/money/money';
import type { ApTaxBasis } from '../domain/bill-tax';

function asTaxBasis(value: string | null | undefined): ApTaxBasis {
  if (value === 'canonical' || value === 'legacy_undivided' || value === 'zero_exempt') {
    return value;
  }
  return 'legacy_undivided';
}

export function ApBillTaxSummary({
  netAmount,
  taxAmount,
  grossAmount,
  currency,
  taxBasis,
  compact = false,
}: {
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly taxBasis?: string | null;
  readonly compact?: boolean;
}) {
  const t = useTranslations('ap');
  const basis = asTaxBasis(taxBasis);
  const net = money(netAmount, currency);
  const vat = money(taxAmount, currency);
  const gross = money(grossAmount, currency);
  const basisLabel =
    basis === 'legacy_undivided'
      ? t('detail.taxBasisLegacy')
      : basis === 'zero_exempt'
        ? t('detail.taxBasisZero')
        : t('detail.taxBasisCanonical');

  if (compact) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 text-start" data-testid="ap-bill-tax-summary">
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('detail.net')} · <MoneyText value={net} />
        </p>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('detail.tax')} · <MoneyText value={vat} />
        </p>
        <p className="text-sm font-medium">
          {t('detail.gross')} · <MoneyText value={gross} />
        </p>
        <p className="text-xs text-[var(--pf-text-secondary)]">{basisLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="ap-bill-tax-summary">
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.net')}</p>
          <MoneyText value={net} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.tax')}</p>
          <MoneyText value={vat} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.gross')}</p>
          <MoneyText value={gross} />
        </div>
      </div>
      {basis === 'legacy_undivided' ? (
        <Alert tone="warning">{basisLabel}</Alert>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{basisLabel}</p>
      )}
      <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.actualHint')}</p>
    </div>
  );
}
