import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
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
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

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
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title={rfq.title}
        description={t('rfq.detailDescription')}
        breadcrumb={
          <Link
            href="/procurement/rfqs"
            className={textNavLinkMutedClassName}
          >
            {t('rfq.title')}
          </Link>
        }
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-2">
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
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('rfq.linesTitle')}</h2>
        <ResponsiveTable
          items={lines}
          getRowKey={(line) => line.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rfq.list.columns.description')}</TableHead>
                    <TableHead numeric>{t('rfq.list.columns.quantity')}</TableHead>
                    <TableHead>{t('rfq.list.columns.unit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="max-w-[16rem] truncate font-medium">
                        {line.description}
                      </TableCell>
                      <TableCell numeric>
                        <span dir="ltr">{line.quantity}</span>
                      </TableCell>
                      <TableCell>{line.unit ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(line) => (
            <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <p className="break-words font-medium">{line.description}</p>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                <span dir="ltr">{line.quantity}</span>
                {line.unit ? ` ${line.unit}` : ''}
              </p>
            </div>
          )}
        />
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
            <span dir="ltr">
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(rfq.dueDate))}
            </span>
          </p>
        ) : null}
        {rfq.notes ? (
          <p className="break-words text-sm text-[var(--pf-text-secondary)]">{rfq.notes}</p>
        ) : null}
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('quote.listTitle')}</h2>
        {quotes.length === 0 ? (
          <EmptyState size="sm" title={t('quote.empty')} className="py-6" />
        ) : (
          <ResponsiveTable
            items={quotes}
            getRowKey={(quote) => quote.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
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
                        <TableCell className="max-w-[12rem] truncate font-medium">
                          {quote.vendorName ?? '-'}
                        </TableCell>
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
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {quote.receivedOn ? (
                            <span dir="ltr">
                              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                                new Date(quote.receivedOn),
                              )}
                            </span>
                          ) : (
                            '-'
                          )}
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
            }
            renderMobileCard={(quote) => (
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-semibold">
                    {quote.vendorName ?? '-'}
                  </span>
                  <StatusBadge
                    shape={quoteStatusShape(quote.status)}
                    label={t(`quote.statuses.${quote.status}` as 'quote.statuses.received')}
                  />
                </div>
                {quote.totalAmount ? (
                  <MoneyText value={money(quote.totalAmount, quote.currency)} />
                ) : null}
                {quote.receivedOn ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                      new Date(quote.receivedOn),
                    )}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    {quote.status !== 'accepted' && quote.status !== 'rejected' ? (
                      <AcceptQuoteButton quoteId={quote.id} rfqId={rfq.id} />
                    ) : null}
                    {quote.status !== 'rejected' ? (
                      <CreatePoFromQuoteButton quoteId={quote.id} rfqId={rfq.id} />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          />
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('quote.comparisonTitle')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('rfq.comparisonHint')}</p>
        </div>
        {comparison.length === 0 ? (
          <EmptyState size="sm" title={t('quote.emptyComparison')} className="py-4" />
        ) : (
          <ResponsiveTable
            items={comparison}
            getRowKey={(row) => row.quoteId}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
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
                        <TableCell>
                          <span dir="ltr">{index + 1}</span>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate font-medium">
                          {row.vendorName}
                        </TableCell>
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
            }
            renderMobileCard={(row) => {
              const rank = comparison.findIndex((entry) => entry.quoteId === row.quoteId) + 1;
              return (
                <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-semibold">
                      <span dir="ltr" className="me-2 text-[var(--pf-text-secondary)]">
                        #{rank}
                      </span>
                      {row.vendorName}
                    </p>
                    <StatusBadge
                      shape={quoteStatusShape(row.status)}
                      label={t(`quote.statuses.${row.status}` as 'quote.statuses.received')}
                    />
                  </div>
                  <MoneyText value={money(row.comparableTotal, row.currency)} />
                </div>
              );
            }}
          />
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
