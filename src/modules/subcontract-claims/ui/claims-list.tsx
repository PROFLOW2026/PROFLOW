'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import type { ClaimListItem } from '../domain/types';
import { ClaimStatusBadge } from './status';

function formatClaimAmount(amount: string, currency: string, locale: string): string {
  return bidiIsolate(formatMoneyString(amount, currency, locale));
}

export function ClaimsList({ items, basePath }: { items: readonly ClaimListItem[]; basePath: string }) {
  const t = useTranslations('subcontractClaims');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const missingValue = tCommon('labels.none');
  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.empty')}</p>;
  }
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--pf-border-subtle)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--pf-bg-muted)] text-start">
            <tr>
              <th className="px-3 py-2 font-medium">{t('list.number')}</th>
              <th className="px-3 py-2 font-medium">{t('list.contractor')}</th>
              <th className="px-3 py-2 font-medium">{t('list.period')}</th>
              <th className="px-3 py-2 font-medium">{t('list.status')}</th>
              <th className="px-3 py-2 font-medium text-end">{t('list.submitted')}</th>
              <th className="px-3 py-2 font-medium text-end">{t('list.certified')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--pf-border-subtle)]">
                <td className="px-3 py-2">
                  <Link href={`${basePath}/${item.id}`} className="font-medium text-[var(--pf-text-brand)] hover:underline">
                    {t('list.claimReference', { number: item.claimNumber })}
                  </Link>
                </td>
                <td className="px-3 py-2">{item.vendorName ?? missingValue}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {bidiIsolate(item.periodStart)} – {bidiIsolate(item.periodEnd)}
                </td>
                <td className="px-3 py-2">
                  <ClaimStatusBadge status={item.status} label={t(`status.${item.status}`)} />
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatClaimAmount(item.currentSubmitted, item.currency, locale)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {item.currentCertified
                    ? formatClaimAmount(item.currentCertified, item.currency, locale)
                    : missingValue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`${basePath}/${item.id}`} className="font-semibold text-[var(--pf-text-brand)]">
                {t('list.claimReference', { number: item.claimNumber })}
              </Link>
              <ClaimStatusBadge status={item.status} label={t(`status.${item.status}`)} />
            </div>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              {[item.vendorName, item.agreementTitle].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-2 text-sm">
              {t('list.period')}: {bidiIsolate(item.periodStart)} – {bidiIsolate(item.periodEnd)}
            </p>
            <p className="text-sm tabular-nums">
              {t('list.submitted')}: {formatClaimAmount(item.currentSubmitted, item.currency, locale)}
              {item.currentCertified
                ? ` · ${t('list.certified')}: ${formatClaimAmount(item.currentCertified, item.currency, locale)}`
                : null}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
