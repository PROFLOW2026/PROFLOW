import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { formatDecimalDisplay } from '@/shared/number/display';
import {
  SupplierRfqAccessLinkError,
  resolveSupplierRfqPublicView,
} from '@/modules/procurement/application/supplier-rfq-access-links';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { SupplierRfqQuoteForm } from './supplier-rfq-quote-form';

async function loadSupplierRfqView(token: string) {
  try {
    const view = await resolveSupplierRfqPublicView(token);
    return { ok: true as const, view };
  } catch (error) {
    const reason =
      error instanceof SupplierRfqAccessLinkError ? error.publicReason : ('invalid' as const);
    return { ok: false as const, reason };
  }
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * PUBLIC one-time supplier quote on an existing RFQ (D11 phase 1).
 * No app shell, no procurement browse, no accounts payable.
 */
export default async function SupplierRfqAccessPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);
  const t = await getTranslations('procurement.supplierRfqLink');
  const loaded = await loadSupplierRfqView(token);
  if (!loaded.ok) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
        <Alert tone="danger">{t(`errors.${loaded.reason}` as 'errors.invalid')}</Alert>
      </main>
    );
  }

  const view = loaded.view;
  return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs text-[var(--pf-text-secondary)]">{view.organizationName}</p>
          <h1 className="text-xl font-semibold">{view.rfqTitle}</h1>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('invitedAs', { vendor: view.vendorName })}
          </p>
          {view.rfqDueDate ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('dueDate')}: <span dir="ltr">{view.rfqDueDate}</span>
            </p>
          ) : null}
          {view.rfqNotes ? (
            <p className="break-words text-sm text-[var(--pf-text-secondary)]">{view.rfqNotes}</p>
          ) : null}
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t('requestedLines')}</h2>
          <ul className="flex flex-col gap-2">
            {view.lines.map((line) => (
              <li
                key={`${line.description}-${line.quantity}`}
                className="rounded-lg border border-[var(--pf-border-default)] p-3 text-sm"
              >
                <p className="font-medium">{line.description}</p>
                <p className="text-[var(--pf-text-secondary)]">
                  <span dir="ltr">{formatDecimalDisplay(line.quantity, locale)}</span>
                  {line.unit ? ` ${line.unit}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="mb-4 text-sm font-semibold">{t('submitSection')}</h2>
          <WithClientMessages namespaces={['procurement']}>
            <SupplierRfqQuoteForm
              token={token}
              defaultCurrency={view.defaultCurrency}
              seedLines={view.lines.map((line) => ({
                description: line.description,
                quantity: line.quantity,
              }))}
            />
          </WithClientMessages>
        </section>
      </main>
  );
}
