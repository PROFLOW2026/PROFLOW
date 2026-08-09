import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApBillDetail, type ApBillStatus } from '@/modules/ap';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listExpensesForOrg } from '@/modules/expenses';
import { listPurchaseOrdersForOrg } from '@/modules/procurement';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { MatchDecisionButtons, ProposeMatchForm } from './match-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; billId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('detail.title') };
}

function billStatusShape(status: string): StatusShape {
  switch (status as ApBillStatus) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'active';
    case 'partially_matched':
      return 'pending';
    case 'matched':
      return 'completed';
    case 'void':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function ApBillDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  const { billId } = await params;
  const t = await getTranslations('ap');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.AP_READ)) return null;

    const detail = await getApBillDetail(context, billId);
    if (!detail) return null;

    const canManage = hasPermission(context, PERMISSIONS.AP_MANAGE);
    const canReadPo = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
    const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);

    const [orders, expensesResult, documentsPanel] = await Promise.all([
      canReadPo ? listPurchaseOrdersForOrg(context) : Promise.resolve([]),
      canReadExpenses
        ? listExpensesForOrg(context, { limit: 50 })
        : Promise.resolve({ items: [], total: 0 }),
      getEntityDocumentPanelData(context, 'ap_bill', billId),
    ]);

    return {
      ...detail,
      canManage,
      documentsPanel,
      purchaseOrders: orders
        .filter((po) => po.vendorId === detail.bill.vendorId)
        .map((po) => ({
          id: po.id,
          label: po.reference?.trim() || po.id.slice(0, 8),
        })),
      expenses: expensesResult.items.map((expense) => ({
        id: expense.id,
        label: `${expense.description || expense.id.slice(0, 8)} · ${expense.grossAmount.amount} ${expense.grossAmount.currency}`,
      })),
    };
  });

  if (!data) notFound();

  const { bill, lines, matches, matchPosition, canManage, purchaseOrders, expenses, documentsPanel } =
    data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={bill.reference?.trim() || t('list.noReference')}
        description={t('detail.description')}
        breadcrumb={
          <Link
            href="/procurement/ap"
            className="rounded-sm text-sm text-[var(--pf-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {t('title')}
          </Link>
        }
        meta={
          <StatusBadge
            shape={billStatusShape(bill.status)}
            label={t(`statuses.${bill.status}` as 'statuses.open')}
          />
        }
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.total')}</p>
          <MoneyText value={money(bill.totalAmount, bill.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.billDate')}</p>
          <p>
            {bill.billDate ? (
              <span dir="ltr">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(bill.billDate),
                )}
              </span>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.ruleNote')}</p>
        </div>
      </div>

      <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('detail.matchPositionTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.acceptedMatched')}</p>
            <MoneyText
              value={money(matchPosition.acceptedMatchedTotal, matchPosition.currency)}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.remainingUnmatched')}</p>
            <MoneyText
              value={money(matchPosition.remainingUnmatched, matchPosition.currency)}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.remainingIncludingProposed')}</p>
            <MoneyText
              value={money(matchPosition.remainingIncludingProposed, matchPosition.currency)}
            />
          </div>
        </div>
        {matchPosition.hasOverMatchVariance ? (
          <Alert tone="warning" className="mt-3">
            {t('detail.varianceWarning', {
              variance: matchPosition.overMatchVariance,
              currency: matchPosition.currency,
            })}
          </Alert>
        ) : (
          <p className="mt-3 text-xs text-[var(--pf-text-muted)]">{t('detail.partialMatchHint')}</p>
        )}
      </section>

      <section className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold">{t('detail.linesTitle')}</h2>
        <ResponsiveTable
          items={lines}
          getRowKey={(line) => line.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('create.lineDescription')}</TableHead>
                    <TableHead>{t('create.linePoLine')}</TableHead>
                    <TableHead numeric>{t('create.lineQuantity')}</TableHead>
                    <TableHead numeric>{t('create.lineUnitAmount')}</TableHead>
                    <TableHead numeric>{t('create.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="max-w-[16rem] truncate">{line.description}</TableCell>
                      <TableCell className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                        {line.purchaseOrderLineId
                          ? line.purchaseOrderLineId.slice(0, 8)
                          : '—'}
                      </TableCell>
                      <TableCell numeric>
                        <span dir="ltr">{line.quantity}</span>
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(line.unitAmount, line.currency)} />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(line.lineTotal, line.currency)} />
                      </TableCell>
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
                {' · '}
                <MoneyText value={money(line.unitAmount, line.currency)} />
              </p>
              <MoneyText value={money(line.lineTotal, line.currency)} />
            </div>
          )}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-sm font-semibold">{t('detail.matchesTitle')}</h2>

        {matches.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('detail.noMatches')}</p>
        ) : (
          <ResponsiveTable
            items={matches}
            getRowKey={(match) => match.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('match.columns.target')}</TableHead>
                      <TableHead numeric>{t('match.columns.amount')}</TableHead>
                      <TableHead>{t('match.columns.status')}</TableHead>
                      {canManage ? <TableHead>{t('match.columns.actions')}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((match) => (
                      <TableRow key={match.id}>
                        <TableCell className="max-w-[16rem] truncate text-sm">
                          {[
                            match.purchaseOrderId
                              ? `${t('match.poShort')}: ${match.purchaseOrderId.slice(0, 8)}`
                              : null,
                            match.expenseId
                              ? `${t('match.expenseShort')}: ${match.expenseId.slice(0, 8)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={money(match.matchedAmount, match.currency)} />
                        </TableCell>
                        <TableCell>
                          {t(`match.statuses.${match.status}` as 'match.statuses.proposed')}
                        </TableCell>
                        <TableCell>
                          {canManage && match.status === 'proposed' ? (
                            <MatchDecisionButtons matchId={match.id} billId={bill.id} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(match) => (
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <p className="break-words text-sm font-medium">
                  {[
                    match.purchaseOrderId
                      ? `${t('match.poShort')}: ${match.purchaseOrderId.slice(0, 8)}`
                      : null,
                    match.expenseId
                      ? `${t('match.expenseShort')}: ${match.expenseId.slice(0, 8)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MoneyText value={money(match.matchedAmount, match.currency)} />
                  <span className="text-sm text-[var(--pf-text-secondary)]">
                    {t(`match.statuses.${match.status}` as 'match.statuses.proposed')}
                  </span>
                </div>
                {canManage && match.status === 'proposed' ? (
                  <MatchDecisionButtons matchId={match.id} billId={bill.id} />
                ) : null}
              </div>
            )}
          />
        )}

        {canManage && bill.status !== 'void' ? (
          <ProposeMatchForm
            billId={bill.id}
            currency={bill.currency}
            defaultAmount={matchPosition.remainingIncludingProposed}
            remainingLabel={matchPosition.remainingIncludingProposed}
            purchaseOrders={purchaseOrders}
            expenses={expenses}
          />
        ) : null}
      </section>

      <DocumentAttachments
        ownerType="ap_bill"
        ownerId={bill.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
