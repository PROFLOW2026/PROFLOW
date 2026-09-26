'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/shared/i18n/navigation';
import {
  buildVendorBillCreateHref,
  findNonVoidBillsForVendorReference,
  type SupplierBillReferenceRow,
} from '../domain/supplier-cost-guidance';

export function SupplierCostGuidance({
  vendorId,
  projectId,
  referenceText,
  bills,
}: {
  readonly vendorId: string;
  readonly projectId?: string | null;
  /** Expense description, used as the invoice reference stand-in. */
  readonly referenceText: string;
  readonly bills: readonly SupplierBillReferenceRow[];
}) {
  const t = useTranslations('expenses.capture');

  if (!vendorId) return null;

  const href = buildVendorBillCreateHref({ vendorId, projectId });
  const referenceHits = findNonVoidBillsForVendorReference(
    { vendorId, reference: referenceText },
    bills,
  );

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info" title={t('vendorBillGuidanceTitle')}>
        <p>{t('vendorBillGuidanceBody')}</p>
        <p className="mt-2">
          <Link href={href} className="font-medium underline">
            {t('vendorBillGuidanceLink')}
          </Link>
        </p>
      </Alert>
      {referenceHits.length > 0 ? (
        <Alert tone="warning" title={t('referenceMatchTitle')}>
          <p>{t('referenceMatchBody')}</p>
          <ul className="mt-2 list-disc ps-5 text-sm">
            {referenceHits.map((bill) => (
              <li key={bill.id}>
                <Link href={`/procurement/ap/${bill.id}`} className="font-medium underline">
                  {bill.reference?.trim() || bill.id.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
