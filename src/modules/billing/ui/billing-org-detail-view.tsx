import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
  MainAppTableShell,
} from '@/components/patterns/main-app';
﻿import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getBillingRecord } from '@/modules/billing';
import { labelForStoredPaymentMethod } from '@/modules/billing/domain/payment-entry';
import { loadLinkedContractCurrentAmount } from '@/modules/billing/application/load-linked-contract-current';
import { statutoryStatusBlocksDraftEdit } from '@/modules/billing/domain/draft-rules';
import { BillingDetailActions } from '@/modules/billing/ui/billing-detail-actions';
import { DraftBillingEditForm } from '@/modules/billing/ui/draft-billing-edit-form';
import { CustomerPaymentCorrectionPanel } from '@/modules/billing/ui/customer-payment-correction-panel';
import { FinalizedBillingEditForm } from '@/modules/billing/ui/finalized-billing-edit-form';
import { BillingStatusBadge } from '@/modules/billing/ui/billing-status-badge';
import { BillingVatBreakdown } from '@/modules/billing/ui/billing-vat-breakdown';
import {
  releaseBillingRetentionAction,
  updateBillingRetentionAction,
} from '@/modules/billing/ui/actions';
import {
  employeeReleaseBillingRetentionAction,
  employeeUpdateBillingRetentionAction,
} from '@/app/[locale]/employee/(shell)/billing/actions';
import { listBillingRetentionReleases } from '@/modules/retention';
import { RetentionPanel } from '@/modules/retention/ui/retention-panel';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { notFound } from 'next/navigation';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';
import { BillingPaymentRecordedAlert } from '@/modules/billing/ui/billing-payment-recorded-alert';
import { CollectionModeNote } from '@/modules/billing/ui/collection-mode-note';
import { CollectionFollowUpCard } from '@/modules/billing/ui/collection-follow-up-card';
import { IssueCreditNoteForm } from '@/modules/billing/ui/issue-credit-note-form';
import {
  canIssueInternalCreditNote,
  showsCollectionFollowUp,
} from '@/modules/billing/domain/collection-follow-up';
import { isExternalStatutoryUiEnabled } from '@/modules/invoicing-integration/application/assert-feature-enabled';
import {
  getOrgInvoicingSettings,
  getStatutoryProviderStatus,
  listExternalStatutoryDocumentsForBilling,
} from '@/modules/invoicing-integration';
import {
  isCollectionOnlyMode,
  resolveAccountingProviderDisplayName,
} from '@/modules/invoicing-integration/domain/collection-mode';
import { resolvePaymentReceiptOutcome } from '@/modules/invoicing-integration/domain/payment-receipt-outcome';
import { resolveStatutoryProviderForOrg } from '@/modules/invoicing-integration/server';
import { BillingAccountingDocumentsSection } from '@/modules/invoicing-integration/ui/billing-accounting-documents-section';
import { isZeroMoney } from '@/shared/money/money';
import { CustomerStatementActions } from '@/modules/reports/ui';
import {
  getOrganizationPrimaryStorage,
  type StorageProviderKey,
} from '@/modules/external-storage/server';

export interface BillingOrgDetailSearchParams {
  paymentRecorded?: string;
  paymentId?: string;
}

interface BillingOrgDetailViewProps {
  readonly billingRecordId: string;
  readonly routeBase: string;
  readonly surface?: OrgListSurface;
  readonly locale: string;
  readonly searchParams?: BillingOrgDetailSearchParams;
}

export async function BillingOrgDetailView({
  billingRecordId,
  routeBase,
  surface = 'owner',
  locale,
  searchParams: query = {},
}: BillingOrgDetailViewProps) {
  const paymentId = query.paymentId ?? null;
  const t = await getTranslations('billing');
  const tMethods = await getTranslations('billing.paymentForm.methods');
  const methodLabels = {
    cash: tMethods('cash'),
    check: tMethods('check'),
    bank_transfer: tMethods('bank_transfer'),
    credit_card: tMethods('credit_card'),
    other: tMethods('other'),
  };
  const tKind = await getTranslations('billing.kinds');
  const tPayment = await getTranslations('status.payment');

  let record;
  let canManage = false;
  let canRetroactiveEdit = false;
  let canCommunicate = false;
  let documentsPanel: Awaited<ReturnType<typeof getEntityDocumentPanelData>> | null = null;
  let retentionReleases: Awaited<ReturnType<typeof listBillingRetentionReleases>> = [];
  let orgToday = '';
  let externalDocuments: Awaited<ReturnType<typeof listExternalStatutoryDocumentsForBilling>> = [];
  let statutoryProviderStatus: Awaited<ReturnType<typeof getStatutoryProviderStatus>> | null =
    null;
  let primaryStorageProvider: StorageProviderKey | null = null;
  let showExternalStatutory = false;
  let invoicingSettings: Awaited<ReturnType<typeof getOrgInvoicingSettings>> | null = null;
  let contractCurrentAmount: string | null = null;

  try {
    const result = await withOrgContext(async (context) => {
      if (surface === 'employee') {
        await assertEmployeeAppContext(context);
        if (!orgListHasPermission(context, PERMISSIONS.BILLING_READ, surface)) {
          throw new Error('forbidden');
        }
      }
      const provider = await resolveStatutoryProviderForOrg(context);
      const settings = await getOrgInvoicingSettings(context);
      const record = await getBillingRecord(context, billingRecordId);
      const contractCurrentAmount =
        record.status === 'draft'
          ? await loadLinkedContractCurrentAmount(
              context,
              record.contractId,
              record.totalAmount.currency,
            )
          : null;
      return {
        record,
        contractCurrentAmount,
        canManage: orgListHasPermission(context, PERMISSIONS.BILLING_MANAGE, surface),
        canRetroactiveEdit:
          surface === 'owner' &&
          context.roleKeys.includes('owner') &&
          orgListHasPermission(context, PERMISSIONS.BILLING_MANAGE, surface),
        canCommunicate: orgListHasPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE, surface),
        documentsPanel: await getEntityDocumentPanelData(context, 'billing_record', billingRecordId),
        retentionReleases: await listBillingRetentionReleases(context, billingRecordId).catch(
          () => [],
        ),
        orgToday: todayInTimeZone(context.organization.timezone),
        externalDocuments: await listExternalStatutoryDocumentsForBilling(context, {
          billingRecordId,
        }).catch(() => []),
        statutoryProviderStatus: getStatutoryProviderStatus(context, provider),
        showExternalStatutory: await isExternalStatutoryUiEnabled(context, provider),
        primaryStorage: await getOrganizationPrimaryStorage(context),
        invoicingSettings: settings,
      };
    });
    record = result.record;
    canManage = result.canManage;
    canRetroactiveEdit = result.canRetroactiveEdit;
    canCommunicate = result.canCommunicate;
    documentsPanel = result.documentsPanel;
    retentionReleases = result.retentionReleases;
    orgToday = result.orgToday;
    externalDocuments = result.externalDocuments;
    statutoryProviderStatus = result.statutoryProviderStatus;
    primaryStorageProvider = result.primaryStorage?.provider ?? null;
    showExternalStatutory = result.showExternalStatutory;
    invoicingSettings = result.invoicingSettings;
    contractCurrentAmount = result.contractCurrentAmount;
  } catch {
    notFound();
  }

  const receiptOutcome = resolvePaymentReceiptOutcome(externalDocuments, paymentId);
  const providerDisplayName = statutoryProviderStatus
    ? resolveAccountingProviderDisplayName(statutoryProviderStatus.providerId)
    : null;
  const fullyPaid = isZeroMoney(record.outstandingAmount);
  const issuedStatutory = externalDocuments.some((document) =>
    statutoryStatusBlocksDraftEdit(document.status),
  );
  const canEditDraft = canManage && record.status === 'draft' && !issuedStatutory && Boolean(record.projectId);
  const canEditFinalized =
    canRetroactiveEdit &&
    record.status === 'finalized' &&
    !record.voidsBillingRecordId &&
    record.kind !== 'credit_note';
  const draftEntryAmount =
    record.vatMode === 'inclusive' ? record.totalAmount.amount : record.subtotalAmount.amount;
  const captureRetentionAction =
    surface === 'employee' ? employeeUpdateBillingRetentionAction : updateBillingRetentionAction;
  const releaseRetentionAction =
    surface === 'employee' ? employeeReleaseBillingRetentionAction : releaseBillingRetentionAction;

  return (
    <MainAppPage>
      <PageHeader
        title={record.reference ?? t('detail.title')}
        description={record.projectName ?? undefined}
        meta={
          <BillingStatusBadge status={record.status} collectionStatus={record.collectionStatus} />
        }
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            {canManage && record.status === 'finalized' ? (
              <Button asChild variant="secondary" className="max-w-full">
                <Link href={`${routeBase}/payments/new?billingRecordId=${record.id}`}>
                  {t('detail.recordPayment')}
                </Link>
              </Button>
            ) : null}
            {surface === 'owner' && record.clientId ? (
              <CustomerStatementActions
                clientId={record.clientId}
                clientName={record.customerSnapshot?.name ?? record.clientId}
                clientEmail={record.customerSnapshot?.email ?? null}
                clientPhone={record.customerSnapshot?.phone ?? null}
                canCommunicate={canCommunicate}
                compact
                previewLabel={t('detail.clientAccountStatementPreview')}
              />
            ) : null}
            {surface === 'owner' ? (
              <PrepareMessageLink
                entityType="billing_record"
                entityId={record.id}
                projectId={record.projectId}
                clientId={record.clientId}
                recipientEmail={record.customerSnapshot?.email}
                subject={record.reference}
                disabled={!canCommunicate}
              />
            ) : null}
            <BillingDetailActions
              billingRecordId={record.id}
              canManage={canManage}
              canRetroactiveVoid={canRetroactiveEdit}
              status={record.status}
              recordReference={record.reference}
              surface={surface}
              paymentActions={record.payments.map((payment) => ({
                paymentId: payment.id,
                status: payment.status,
                amount: payment.amount,
                paymentDate: payment.paymentDate,
              }))}
            />
          </div>
        }
      />
      <Suspense fallback={null}>
        <BillingPaymentRecordedAlert
          outstandingAmount={record.outstandingAmount}
          fullyPaid={fullyPaid}
          receiptOutcome={receiptOutcome}
          providerDisplayName={providerDisplayName}
        />
      </Suspense>

      {invoicingSettings && isCollectionOnlyMode(invoicingSettings) ? <CollectionModeNote /> : null}

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('detail.totalDue')}>
            <MoneyText value={record.totalAmount} className="font-semibold" />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.paid')}>
            <MoneyText value={record.paidAmount} className="font-semibold" />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.outstanding')}>
            <MoneyText value={record.outstandingAmount} className="font-semibold" colorizeNegative />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.status')}>
            <BillingStatusBadge status={record.status} collectionStatus={record.collectionStatus} />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.issueDate')}>
            <span dir="ltr">{formatBusinessDate(record.issueDate, locale)}</span>
          </MainAppSummaryItem>
          {record.dueDate ? (
            <MainAppSummaryItem label={t('detail.dueDate')}>
              <span dir="ltr">{formatBusinessDate(record.dueDate, locale)}</span>
            </MainAppSummaryItem>
          ) : null}
          <MainAppSummaryItem label={t('detail.kind')}>{tKind(record.kind)}</MainAppSummaryItem>
        </MainAppSummaryGrid>
      </MainAppSection>

      <MainAppSection title={t('detail.amountBreakdownTitle')}>
        <BillingVatBreakdown
          subtotalAmount={record.subtotalAmount}
          taxAmount={record.taxAmount}
          totalAmount={record.totalAmount}
          labels={{
            net: t('detail.beforeVat'),
            tax: t('detail.vat'),
            gross: t('detail.totalDue'),
            includingVat: t('list.includingVat'),
          }}
          className="grid gap-3 text-sm sm:grid-cols-3"
        />
        {record.contractName ? (
          <p className="mt-3 text-xs text-[var(--pf-text-secondary)]">
            {t('list.contract')}: {record.contractName}
          </p>
        ) : null}
        {record.kind === 'credit_note' ? (
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
            {t('integrity.creditNoteReducesInvoiced')}
          </p>
        ) : null}
        {record.status === 'void' ? (
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('integrity.voidExcluded')}</p>
        ) : null}
      </MainAppSection>

      {invoicingSettings && statutoryProviderStatus ? (
        <MainAppSection>
          <BillingAccountingDocumentsSection
            settings={invoicingSettings}
            billingRecordId={record.id}
            billingStatus={record.status}
            canManage={canManage}
            providerStatus={statutoryProviderStatus}
            documents={externalDocuments}
            hasCustomerSnapshot={Boolean(record.customerSnapshot?.name?.trim())}
            customerEmail={record.customerSnapshot?.email ?? null}
            customerPhone={record.customerSnapshot?.phone ?? null}
            primaryStorageProvider={primaryStorageProvider}
            accountingUiEnabled={showExternalStatutory}
            surface={surface}
          />
        </MainAppSection>
      ) : null}

      <RetentionPanel
        side="ar"
        sourceId={record.id}
        currency={record.totalAmount.currency}
        totalAmount={record.totalAmount.amount}
        retentionAmount={record.retentionAmount?.amount ?? '0'}
        retentionHeldRemaining={record.retentionHeldRemaining?.amount ?? '0'}
        payableOrReceivableNow={record.outstandingAmount.amount}
        canManage={canManage}
        canEditDraft={record.status === 'draft'}
        canRelease={record.status === 'finalized' && record.kind !== 'credit_note'}
        defaultReleaseDate={orgToday}
        releases={retentionReleases.map((row) => ({
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          releasedOn: row.releasedOn,
          notes: row.notes,
        }))}
        locale={locale}
        captureAction={captureRetentionAction}
        releaseAction={releaseRetentionAction}
      />

      {canEditDraft && record.projectId ? (
        <MainAppSection>
          <DraftBillingEditForm
            billingRecordId={record.id}
            projectId={record.projectId}
            currency={record.totalAmount.currency}
            initialAmount={draftEntryAmount}
            issueDate={record.issueDate}
            dueDate={record.dueDate}
            reference={record.reference}
            notes={record.notes}
            locale={locale}
            contractCurrentAmount={contractCurrentAmount}
          />
        </MainAppSection>
      ) : null}

      {canEditFinalized ? (
        <MainAppSection>
          <FinalizedBillingEditForm
            billingRecordId={record.id}
            projectId={record.projectId}
            clientId={record.clientId}
            currency={record.totalAmount.currency}
            vatMode={record.vatMode}
            initialAmount={draftEntryAmount}
            subtotalAmount={record.subtotalAmount.amount}
            totalAmount={record.totalAmount.amount}
            issueDate={record.issueDate}
            dueDate={record.dueDate}
            reference={record.reference}
            notes={record.notes}
            hasIssuedStatutoryDocument={issuedStatutory}
            locale={locale}
          />
        </MainAppSection>
      ) : null}

      {showsCollectionFollowUp(record) ? (
        <MainAppSection>
          <CollectionFollowUpCard
            billingRecordId={record.id}
            canManage={canManage}
            showReminder={surface === 'owner'}
            canPrepareReminder={canCommunicate}
            reference={record.reference}
            projectId={record.projectId}
            clientId={record.clientId}
            customerPhone={record.customerSnapshot?.phone ?? null}
            outstandingAmount={record.outstandingAmount}
            contactedAt={record.collectionContactedAt}
            nextFollowUpAt={record.collectionNextFollowUpAt}
            promiseToPayDate={record.collectionPromiseToPayDate}
            note={record.collectionNote}
          />
        </MainAppSection>
      ) : null}

      {canManage && canIssueInternalCreditNote(record) ? (
        <MainAppSection>
          <IssueCreditNoteForm
            billingRecordId={record.id}
            currency={record.totalAmount.currency}
            defaultIssueDate={orgToday}
            surface={surface}
          />
        </MainAppSection>
      ) : null}

      {record.notes ? (
        <MainAppSection title={t('detail.notes')}>
          <p className="whitespace-pre-wrap break-words text-start text-sm">{record.notes}</p>
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('detail.paymentsTitle')}>
        {record.payments.length === 0 ? (
          <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('detail.noPayments')}</p>
        ) : (
          <>
          <ResponsiveTable
            items={record.payments}
            getRowKey={(payment) => payment.id}
            desktop={
              <MainAppTableShell>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('paymentForm.paymentDate')}</TableHead>
                      <TableHead numeric>{t('paymentForm.amount')}</TableHead>
                      <TableHead>{t('paymentForm.method')}</TableHead>
                      <TableHead>{t('paymentForm.reference')}</TableHead>
                      <TableHead>{t('list.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {record.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <span dir="ltr">{formatBusinessDate(payment.paymentDate, locale)}</span>
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={payment.amount} />
                        </TableCell>
                        <TableCell className="max-w-[8rem] truncate">
                          {labelForStoredPaymentMethod(payment.method, methodLabels) ?? '-'}
                        </TableCell>
                        <TableCell className="max-w-[8rem] truncate">{payment.reference ?? '-'}</TableCell>
                        <TableCell>
                          <span className="text-sm text-[var(--pf-text-secondary)]">
                            {tPayment(payment.status)}
                          </span>
                          {canRetroactiveEdit && payment.status === 'recorded' ? (
                            <CustomerPaymentCorrectionPanel
                              paymentId={payment.id}
                              currency={payment.amount.currency}
                              initialPaymentDate={payment.paymentDate}
                              initialAmount={payment.amount.amount}
                              locale={locale}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MainAppTableShell>
            }
            renderMobileCard={(payment) => (
              <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                    {formatBusinessDate(payment.paymentDate, locale)}
                  </span>
                  <span className="shrink-0 text-sm text-[var(--pf-text-secondary)]">
                    {tPayment(payment.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <MoneyText value={payment.amount} />
                </p>
                <p className="mt-1 truncate text-sm text-[var(--pf-text-secondary)]">
                  {labelForStoredPaymentMethod(payment.method, methodLabels) ?? '-'}
                  {payment.reference ? ` · ${payment.reference}` : null}
                </p>
                {canRetroactiveEdit && payment.status === 'recorded' ? (
                  <CustomerPaymentCorrectionPanel
                    paymentId={payment.id}
                    currency={payment.amount.currency}
                    initialPaymentDate={payment.paymentDate}
                    initialAmount={payment.amount.amount}
                    locale={locale}
                  />
                ) : null}
              </div>
            )}
          />
          </>
        )}
      </MainAppSection>

      {documentsPanel ? (
        <MainAppSection>
          <DocumentAttachments
            ownerType="billing_record"
            ownerId={record.id}
            documents={documentsPanel.documents}
            linkCandidates={documentsPanel.linkCandidates}
            canRead={documentsPanel.canRead}
            canManage={documentsPanel.canManage}
            storageConfigured={documentsPanel.storageConfigured}
          />
        </MainAppSection>
      ) : null}
    </MainAppPage>
  );
}
