'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/shared/i18n/navigation';

export interface SupplierReferenceHit {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export function DuplicateVendorBillReferenceWarning({
  hits,
  acknowledged,
  onAcknowledgedChange,
}: {
  readonly hits: readonly SupplierReferenceHit[];
  readonly acknowledged: boolean;
  readonly onAcknowledgedChange: (value: boolean) => void;
}) {
  const t = useTranslations('ap.create');
  if (hits.length === 0) return null;

  return (
    <Alert tone="warning" title={t('duplicateReferenceTitle')}>
      <p>{t('duplicateReferenceBody')}</p>
      <ul className="mt-2 list-disc ps-5 text-sm">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link href={hit.href} className="font-medium underline">
              {hit.label}
            </Link>
          </li>
        ))}
      </ul>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
        />
        <span>{t('duplicateReferenceAck')}</span>
      </label>
    </Alert>
  );
}

export function SupplierExpenseMatchAffordance({
  hits,
  selectedExpenseId,
  onSelectExpenseId,
}: {
  readonly hits: readonly SupplierReferenceHit[];
  readonly selectedExpenseId: string;
  readonly onSelectExpenseId: (expenseId: string) => void;
}) {
  const t = useTranslations('ap.create');
  if (hits.length === 0) return null;

  return (
    <Alert tone="warning" title={t('expenseReferenceMatchTitle')}>
      <p>{t('expenseReferenceMatchBody')}</p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {hits.map((hit) => (
          <li key={hit.id}>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                checked={selectedExpenseId === hit.id}
                onChange={() => onSelectExpenseId(hit.id)}
              />
              <span>
                {t('expenseReferenceMatchChoose')}{' '}
                <Link href={hit.href} className="font-medium underline">
                  {hit.label}
                </Link>
              </span>
            </label>
          </li>
        ))}
        <li>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-1"
              checked={selectedExpenseId === ''}
              onChange={() => onSelectExpenseId('')}
            />
            <span>{t('expenseReferenceMatchSkip')}</span>
          </label>
        </li>
      </ul>
    </Alert>
  );
}

export function SuggestedExpenseMatchHint({
  expenseId,
  label,
}: {
  readonly expenseId: string;
  readonly label: string;
}) {
  const t = useTranslations('ap.match');
  return (
    <Alert tone="warning" title={t('suggestedExpenseTitle')}>
      <p>{t('suggestedExpenseBody')}</p>
      <p className="mt-2">
        <Link href={`/expenses/${expenseId}`} className="font-medium underline">
          {label}
        </Link>
      </p>
    </Alert>
  );
}
