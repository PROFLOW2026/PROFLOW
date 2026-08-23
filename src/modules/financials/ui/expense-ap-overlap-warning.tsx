'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/shared/i18n/navigation';

export interface ExpenseApOverlapHit {
  readonly id: string;
  readonly label: string;
  readonly amount: string;
  readonly currency: string;
  readonly href: string;
}

export function ExpenseApOverlapWarning({
  hits,
  namespace,
}: {
  readonly hits: readonly ExpenseApOverlapHit[];
  /** `ap.create` or `expenses.capture` */
  readonly namespace: 'ap.create' | 'expenses.capture';
}) {
  const t = useTranslations(namespace);

  if (hits.length === 0) return null;

  return (
    <Alert tone="warning" title={t('overlapWarningTitle')}>
      <p>{t('overlapWarningBody')}</p>
      <ul className="mt-2 list-disc ps-5 text-sm">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link href={hit.href} className="font-medium underline">
              {hit.label}
            </Link>
            <span dir="ltr" className="pf-numeric ms-1">
              · {hit.amount} {hit.currency}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">{t('overlapWarningHint')}</p>
    </Alert>
  );
}
