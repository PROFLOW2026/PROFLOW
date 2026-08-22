import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCatalogEntryById, localizePaymentTermName } from '@/modules/business-catalog';
import {
  getApBillDetail,
  getBillPayablePosition,
  isRecognizedVendorBillStatus,
  listCreditsForBill,
  listVendorPaymentsForBill,
  type ApBillStatus,
} from '@/modules/ap';
import { listVendorBillRetentionReleases } from '@/modules/retention';
import { RetentionPanel } from '@/modules/retention/ui/retention-panel';
import {
  releaseVendorBillRetentionAction,
  updateDraftApBillRetentionAction,
} from '../actions';
import { VendorBillAllocationPanel } from '@/modules/ap/ui/vendor-bill-allocation-panel';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listExpensesForOrg } from '@/modules/expenses';
import { listPurchaseOrdersForOrg } from '@/modules/procurement';
import { listProjectsForOrg } from '@/modules/projects';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { MatchDecisionButtons, ProposeMatchForm } from './match-actions';
import { VendorPaymentPanel } from './payment-actions';
import { VendorCreditPanel } from './credit-actions';
import { PostApBillPanel } from './post-actions';
import { VoidApBillPanel } from './void-actions';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { ApBillTaxSummary } from '@/modules/ap/ui/ap-bill-tax-summary';

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

    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);

    const [orders, expensesResult, documentsPanel, payablePosition, paymentRows, creditRows, projects, retentionReleases, paymentTerm] =
      await Promise.all([
        canReadPo ? listPurchaseOrdersForOrg(context) : Promise.resolve([]),
        canReadExpenses
          ? listExpensesForOrg(context, { limit: 50 })
          : Promise.resolve({ items: [], total: 0 }),
        getEntityDocumentPanelData(context, 'ap_bill', billId),
        getBillPayablePosition(context, billId),
        listVendorPaymentsForBill(context, billId).catch(() => []),
        listCreditsForBill(context, billId).catch(() => []),
        canReadProjects
          ? listProjectsForOrg(context, {}).catch(() => [])
          : Promise.resolve([]),
        listVendorBillRetentionReleases(context, billId).catch(() => []),
        detail.bill.paymentTermId
          ? getCatalogEntryById(context.db, context.organizationId, detail.bill.paymentTermId)
          : Promise.resolve(null),
      ]);

    const hasActivePayments = paymentRows.some((row) => row.payment.status === 'recorded');
    const hasActiveCredits = creditRows.some((row) => row.application.status === 'applied');

    return {
      ...detail,
      canManage,
      paymentTermName: paymentTerm
        ? localizePaymentTermName(paymentTerm.key, paymentTerm.name, locale)
        : null,
      documentsPanel,
      payablePosition,
      hasActivePayments,
      hasActiveCredits,
      retentionReleases: retentionReleases.map((row) => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        releasedOn: row.releasedOn,
        notes: row.notes,
      })),
      orgToday: todayInTimeZone(context.organization.timezone),
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      payments: paymentRows.map((row) => ({
        id: row.payment.id,
        amount: row.payment.amount,
        currency: row.payment.currency,
        paymentDate: row.payment.paymentDate,
        method: row.payment.method,
        reference: row.payment.reference,
        status: row.payment.status,
        notes: row.payment.notes,
      })),
      credits: creditRows.map((row) => ({
        applicationId: row.application.id,
        creditId: row.credit.id,
        amount: row.application.amount,
        currency: row.application.currency,
        status: row.application.status,
        creditReference: row.credit.reference,
        creditDate: row.credit.creditDate,
      })),
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

  const {
    bill,
    lines,
    matches,
    matchPosition,
    canManage,
    purchaseOrders,
    expenses,
    documentsPanel,
    payablePosition,
    payments,
    credits,
    hasActivePayments,
    hasActiveCredits,
    retentionReleases,
    projects,
    orgToday,
    paymentTermName,
  } = data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={bill.reference?.trim() || t('list.noReference')}
        description={t('detail.description')}
        breadcrumb={
          <Link
            href="/procurement/ap"
            className={textNavLinkMutedClassName}
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

      <ApBillTaxSummary
        netAmount={bill.netAmount ?? bill.totalAmount}
        taxAmount={bill.taxAmount ?? '0'}
        grossAmount={bill.grossAmount ?? bill.totalAmount}
        currency={bill.currency}
        taxBasis={bill.taxBasis}
      />
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
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
              '-'
            )}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.dueDate')}</p>
          <p>
            {bill.dueDate ? (
              <span dir="ltr">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(bill.dueDate),
                )}
              </span>
            ) : (
              '-'
            )}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.paymentTerm')}</p>
          <p>{paymentTermName ?? (bill.paymentTermId ? bill.paymentTermId.slice(0, 8) : '-')}</p>
        </div>
      </div>

      {(bill.purchaseOrderId || bill.subcontractAgreementId) ? (
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="mb-2 text-sm font-semibold">{t('detail.linksTitle')}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--pf-text-muted)]">{t('detail.linkedPo')}</dt>
              <dd className="mt-1" dir="ltr">
                {bill.purchaseOrderId ? (
                  <Link href={`/procurement/orders/${bill.purchaseOrderId}`} className={textNavLinkMutedClassName}>
                    {bill.purchaseOrderId.slice(0, 8)}
                  </Link>
                ) : (
                  '-'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--pf-text-muted)]">{t('detail.subcontract')}</dt>
              <dd className="mt-1" dir="ltr">
                {bill.subcontractAgreementId ? bill.subcontractAgreementId.slice(0, 8) : '-'}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.ruleNote')}</p>

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
                          : '-'}
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

      {projects.length > 0 ? (
        <VendorBillAllocationPanel
          billId={bill.id}
          currency={bill.currency}
          recognizedNet={bill.netAmount ?? bill.totalAmount}
          headerProjectId={bill.projectId}
          projects={projects}
          canManage={canManage}
        />
      ) : null}

      <RetentionPanel
        side="ap"
        sourceId={bill.id}
        currency={bill.currency}
        totalAmount={bill.totalAmount}
        retentionAmount={bill.retentionAmount}
        retentionHeldRemaining={bill.retentionHeldRemaining}
        payableOrReceivableNow={payablePosition?.outstanding ?? '0'}
        canManage={canManage}
        canEditDraft={bill.status === 'draft'}
        canRelease={isRecognizedVendorBillStatus(bill.status)}
        defaultReleaseDate={orgToday}
        releases={retentionReleases}
        locale={locale}
        captureAction={updateDraftApBillRetentionAction}
        releaseAction={releaseVendorBillRetentionAction}
      />

      {payablePosition ? (
        <VendorPaymentPanel
          billId={bill.id}
          currency={payablePosition.currency}
          outstanding={payablePosition.outstanding}
          paid={payablePosition.paid}
          payableStatus={payablePosition.payableStatus}
          paymentsAvailable={payablePosition.paymentsAvailable}
          canManage={canManage}
          defaultPaymentDate={orgToday}
          payments={payments}
          locale={locale}
        />
      ) : null}

      {payablePosition && bill.status !== 'void' ? (
        <VendorCreditPanel
          billId={bill.id}
          vendorId={bill.vendorId}
          currency={payablePosition.currency}
          outstanding={payablePosition.outstanding}
          canManage={canManage}
          defaultCreditDate={orgToday}
          credits={credits}
          locale={locale}
        />
      ) : null}

      <PostApBillPanel billId={bill.id} canManage={canManage} billStatus={bill.status} />

      <VoidApBillPanel
        billId={bill.id}
        canManage={canManage}
        billStatus={bill.status}
        hasActivePayments={hasActivePayments}
        hasActiveCredits={hasActiveCredits}
      />

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
                            '-'
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
