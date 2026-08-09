import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getQuoteComparisonForRfq,
  getRfqDetail,
  listQuotesForRfq,
  type RfqStatus,
  type SupplierQuoteStatus,
} from '@/modules/procurement';
import { listVendorsForOrg } from '@/modules/vendors';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AcceptQuoteButton, CreatePoFromQuoteButton, RfqStatusButton } from './rfq-actions';
import { QuoteCaptureForm } from './quote-capture-form';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; rfqId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('rfq.detailTitle') };
}
function rfqStatusShape(status: string): StatusShape {
  switch (status as RfqStatus) {
    case 'draft':
      return 'draft';
    case 'sent':
      return 'active';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}
function quoteStatusShape(status: string): StatusShape {
  switch (status as SupplierQuoteStatus) {
    case 'received':
      return 'pending';
    case 'shortlisted':
      return 'active';
    case 'accepted':
      return 'completed';
    case 'rejected':
      return 'cancelled';
    default:
      return 'archived';
  }
}
export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ rfqId: string }>;
}) {
  const { rfqId } = await params;
  const t = await getTranslations('procurement');
  const locale = await getLocale();
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) return null;
    const detail = await getRfqDetail(context, rfqId);
    if (!detail) return null;
    const canManage = hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
    const canReadVendors = hasPermission(context, PERMISSIONS.VENDORS_READ);
    const [quotes, comparison, vendors, documentsPanel] = await Promise.all([
      listQuotesForRfq(context, rfqId),
      getQuoteComparisonForRfq(context, rfqId),
      canReadVendors ? listVendorsForOrg(context, { status: 'active' }) : Promise.resolve([]),
      getEntityDocumentPanelData(context, 'procurement_rfq', rfqId),
    ]);
    return {
      detail,
      quotes,
      comparison,
      vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
      documentsPanel,
      canManage,
      defaultCurrency: context.organization.baseCurrency,
    };
  });
  if (!data) notFound();
  const { detail, quotes, comparison, vendors, documentsPanel, canManage, defaultCurrency } = data;
  const { rfq, lines } = detail;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={rfq.title}
        description={t('rfq.detailDescription')}
        breadcrumb={
          <Link
            href="/procurement/rfqs"
            className="rounded-sm text-sm text-[var(--pf-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {t('rfq.title')}
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              shape={rfqStatusShape(rfq.status)}
              label={t(`rfq.statuses.${rfq.status}` as 'rfq.statuses.draft')}
            />
            {canManage && rfq.status === 'draft' ? (
              <RfqStatusButton rfqId={rfq.id} status="sent" label={t('rfq.markSent')} />
            ) : null}
            {canManage && rfq.status === 'sent' ? (
              <RfqStatusButton rfqId={rfq.id} status="closed" label={t('rfq.markClosed')} />
            ) : null}
            {canManage && (rfq.status === 'draft' || rfq.status === 'sent') ? (
              <RfqStatusButton rfqId={rfq.id} status="cancelled" label={t('rfq.markCancelled')} />
            ) : null}
          </div>
        }
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('rfq.linesTitle')}</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('rfq.list.columns.description')}</TableHead>
                <TableHead>{t('rfq.list.columns.quantity')}</TableHead>
                <TableHead>{t('rfq.list.columns.unit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.description}</TableCell>
                  <TableCell>{line.quantity}</TableCell>
                  <TableCell>{line.unit ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(rfq.projectId || rfq.workPackageId) && (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {rfq.projectId ? t('rfq.linkedProject') : null}
            {rfq.projectId && rfq.workPackageId ? ' · ' : null}
            {rfq.workPackageId ? t('rfq.linkedWorkPackage') : null}
          </p>
        )}
        {rfq.dueDate ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('rfq.dueDate')}:{' '}
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(rfq.dueDate))}
          </p>
        ) : null}
        {rfq.notes ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{rfq.notes}</p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('quote.listTitle')}</h2>
        {quotes.length === 0 ? (
          <EmptyState size="sm" title={t('quote.empty')} className="py-6" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quote.columns.vendor')}</TableHead>
                  <TableHead>{t('quote.columns.status')}</TableHead>
                  <TableHead numeric>{t('quote.columns.total')}</TableHead>
                  <TableHead>{t('quote.columns.received')}</TableHead>
                  {canManage ? <TableHead>{t('list.columns.actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.vendorName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={quoteStatusShape(quote.status)}
                        label={t(`quote.statuses.${quote.status}` as 'quote.statuses.received')}
                      />
                    </TableCell>
                    <TableCell numeric>
                      {quote.totalAmount ? (
                        <MoneyText value={money(quote.totalAmount, quote.currency)} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {quote.receivedOn
                        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            new Date(quote.receivedOn),
                          )
                        : '—'}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {quote.status !== 'accepted' && quote.status !== 'rejected' ? (
                            <AcceptQuoteButton quoteId={quote.id} rfqId={rfq.id} />
                          ) : null}
                          {quote.status !== 'rejected' ? (
                            <CreatePoFromQuoteButton quoteId={quote.id} rfqId={rfq.id} />
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('quote.comparisonTitle')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('rfq.comparisonHint')}</p>
        </div>
        {comparison.length === 0 ? (
          <EmptyState size="sm" title={t('quote.emptyComparison')} className="py-4" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('rfq.list.columns.rank')}</TableHead>
                  <TableHead>{t('quote.columns.vendor')}</TableHead>
                  <TableHead>{t('quote.columns.status')}</TableHead>
                  <TableHead numeric>{t('rfq.list.columns.comparable')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((row, index) => (
                  <TableRow key={row.quoteId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={quoteStatusShape(row.status)}
                        label={t(`quote.statuses.${row.status}` as 'quote.statuses.received')}
                      />
                    </TableCell>
                    <TableCell numeric>
                      <MoneyText value={money(row.comparableTotal, row.currency)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('rfq.poCommittedHint')}</p>
      </section>
      {canManage && vendors.length > 0 ? (
        <QuoteCaptureForm
          rfqId={rfq.id}
          defaultCurrency={defaultCurrency}
          vendors={vendors}
          seedLines={lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
          }))}
        />
      ) : null}

      <DocumentAttachments
        ownerType="procurement_rfq"
        ownerId={rfq.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
