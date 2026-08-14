import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getQuoteById, type QuoteStatus } from '@/modules/quotes';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { QuoteDetailActions, QuotePrintButton } from './quote-detail-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; quoteId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('detail.title') };
}

function quoteShape(status: QuoteStatus): StatusShape {
  switch (status) {
    case 'draft':
    case 'ready':
      return 'pending';
    case 'sent':
      return 'active';
    case 'accepted':
    case 'converted':
      return 'completed';
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const t = await getTranslations('quotes');
  const tStatus = await getTranslations('status.estimateQuote');
  const tTax = await getTranslations('quotes.taxModes');

  const { quote, canManage } = await withOrgContext(async (context) => {
    try {
      const detail = await getQuoteById(context, quoteId);
      return {
        quote: detail,
        canManage: hasPermission(context, PERMISSIONS.QUOTES_MANAGE),
      };
    } catch {
      return { quote: null, canManage: false };
    }
  });

  if (!quote) notFound();

  const workHref = quote.convertedProjectId
    ? `/projects/${quote.convertedProjectId}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={quote.title}
        description={quote.clientName ?? t('detail.title')}
        breadcrumb={
          <Link href="/quotes" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge shape={quoteShape(quote.status)} label={tStatus(quote.status)} />
            <QuotePrintButton label={t('detail.print')} />
          </div>
        }
      />

      <p className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm text-[var(--pf-text-secondary)]">
        {t('disclaimer')}
      </p>

      {quote.description ? (
        <p className="whitespace-pre-wrap text-sm">{quote.description}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('create.lineDescription')}</TableHead>
              <TableHead>{t('create.quantity')}</TableHead>
              <TableHead>{t('create.unit')}</TableHead>
              <TableHead>{t('create.unitPrice')}</TableHead>
              <TableHead>{t('create.unitCost')}</TableHead>
              <TableHead>{t('create.lineTotal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.description}</TableCell>
                <TableCell>
                  <span className="pf-ltr-island" dir="ltr">
                    {line.quantity}
                  </span>
                </TableCell>
                <TableCell>{line.unit ?? '—'}</TableCell>
                <TableCell>
                  <MoneyText value={money(line.unitPriceAmount, quote.currency)} />
                </TableCell>
                <TableCell>
                  {line.estimatedUnitCostAmount ? (
                    <MoneyText value={money(line.estimatedUnitCostAmount, quote.currency)} />
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  {line.lineTotalAmount ? (
                    <MoneyText value={money(line.lineTotalAmount, quote.currency)} />
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-[var(--pf-text-secondary)]">{t('detail.subtotal')}</dt>
          <dd>
            {quote.subtotalAmount ? (
              <MoneyText value={money(quote.subtotalAmount, quote.currency)} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-[var(--pf-text-secondary)]">
            {t('detail.tax')} ({tTax(quote.taxMode)})
          </dt>
          <dd>
            {quote.taxAmount ? <MoneyText value={money(quote.taxAmount, quote.currency)} /> : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2 font-semibold sm:block">
          <dt>{t('detail.total')}</dt>
          <dd>
            {quote.totalAmount ? (
              <MoneyText value={money(quote.totalAmount, quote.currency)} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        {quote.estimatedCostAmount ? (
          <>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-[var(--pf-text-secondary)]">{t('detail.estimatedCost')}</dt>
              <dd>
                <MoneyText value={money(quote.estimatedCostAmount, quote.currency)} />
              </dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-[var(--pf-text-secondary)]">{t('detail.estimatedMargin')}</dt>
              <dd>
                <span className="pf-ltr-island" dir="ltr">
                  {quote.estimatedMarginPercent ?? '—'}%
                </span>
                <span className="ms-2 text-xs text-[var(--pf-text-secondary)]">
                  ({t('detail.notRevenue')})
                </span>
              </dd>
            </div>
          </>
        ) : null}
        {quote.discountAmount || quote.listSubtotalAmount || quote.discountPercent ? (
          <>
            {quote.listSubtotalAmount ? (
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-[var(--pf-text-secondary)]">{t('create.listSubtotalLabel')}</dt>
                <dd>
                  <MoneyText value={money(quote.listSubtotalAmount, quote.currency)} />
                </dd>
              </div>
            ) : null}
            {quote.discountAmount ? (
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-[var(--pf-text-secondary)]">{t('create.discountAmountLabel')}</dt>
                <dd>
                  <MoneyText value={money(quote.discountAmount, quote.currency)} />
                </dd>
              </div>
            ) : null}
            {quote.discountPercent ? (
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-[var(--pf-text-secondary)]">{t('create.discountPercentLabel')}</dt>
                <dd>
                  <span className="pf-ltr-island" dir="ltr">
                    {quote.discountPercent}%
                  </span>
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
        {quote.validityDate ? (
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-[var(--pf-text-secondary)]">{t('list.columns.validUntil')}</dt>
            <dd>
              <span className="pf-ltr-island" dir="ltr">
                {quote.validityDate}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      {quote.notes ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">{quote.notes}</p>
      ) : null}

      {workHref ? (
        <p className="text-sm">
          {t('detail.convertedTo')}:{' '}
          <Link href={workHref} className={textNavLinkClassName}>
            {t('detail.openWork')}
          </Link>
        </p>
      ) : null}

      <QuoteDetailActions
        quoteId={quote.id}
        status={quote.status}
        title={quote.title}
        canManage={canManage}
      />
    </div>
  );
}
