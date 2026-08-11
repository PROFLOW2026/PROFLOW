import { getTranslations } from 'next-intl/server';
import type { StoredDraftPayload } from '../domain/types';
import type { previewPayloadForRun } from '../domain/payload';

export async function PayloadPreview({
  payload,
  preview,
}: {
  payload: StoredDraftPayload;
  preview: ReturnType<typeof previewPayloadForRun>;
}) {
  const t = await getTranslations('recurringDrafts');

  const rows: { label: string; value: string; ltr?: boolean }[] = [
    { label: t('fields.kind'), value: t(`kind.${payload.kind}`) },
    { label: t('fields.runDate'), value: preview.runDate, ltr: true },
  ];

  if (preview.expense) {
    rows.push(
      {
        label: t('fields.amount'),
        value: `${preview.expense.amount} ${preview.expense.currency}`,
        ltr: true,
      },
      { label: t('fields.description'), value: preview.expense.description?.trim() || t('fields.none') },
      { label: t('fields.supplierName'), value: preview.expense.supplierName?.trim() || t('fields.none') },
    );
  }
  if (preview.vendorBill) {
    rows.push(
      {
        label: t('fields.amount'),
        value: `${preview.vendorBill.totalAmount} ${preview.vendorBill.currency}`,
        ltr: true,
      },
      { label: t('list.columns.status'), value: t('fields.draftStatus') },
      {
        label: t('fields.reference'),
        value: preview.vendorBill.reference?.trim() || t('fields.none'),
      },
    );
  }
  if (preview.billing) {
    rows.push(
      {
        label: t('fields.amount'),
        value: `${preview.billing.amount} ${preview.billing.currency ?? ''}`.trim(),
        ltr: true,
      },
      { label: t('fields.reference'), value: preview.billing.reference?.trim() || t('fields.none') },
    );
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{row.label}</dt>
          <dd className="break-words" dir={row.ltr ? 'ltr' : undefined}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
