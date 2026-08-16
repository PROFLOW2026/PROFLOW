'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CUSTOMER_PORTAL_SCOPES,
  VENDOR_PORTAL_SCOPES,
  type ExternalAccessGrantListItem,
  type VendorApBillCandidate,
  type VendorComplianceUploadCandidate,
} from '@/modules/portal/domain/types';
import {
  createCustomerGrantAction,
  createVendorGrantAction,
  previewCustomerSafeSummaryAction,
  previewVendorPortalAction,
  recordVendorQuoteOnBehalfAction,
  reviewVendorCandidateAction,
  revokeCustomerGrantAction,
  revokeVendorGrantAction,
  submitVendorApBillCandidateAction,
  submitVendorComplianceCandidateAction,
  submitVendorQuoteCandidateAction,
  type PortalActionState,
  type PortalPreviewState,
  type VendorPortalPreviewState,
} from './actions';

const PROJECT_STATUS_KEYS = [
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
] as const;

const PROGRESS_STATUS_KEYS = [
  'not_started',
  'on_track',
  'at_risk',
  'delayed',
  'completed',
] as const;

const RFQ_STATUS_KEYS = ['draft', 'sent', 'closed', 'cancelled'] as const;
const PO_STATUS_KEYS = ['draft', 'issued', 'partially_received', 'closed', 'cancelled'] as const;
const ARTIFACT_KIND_KEYS = ['insurance', 'license', 'certification', 'other'] as const;

const NEVER_EXPOSED_KEYS = [
  'profit',
  'margin',
  'trueCost',
  'employeeCost',
  'overhead',
  'laborRate',
  'vendorConfidential',
  'admin',
  'audit',
  'storagePath',
  'internalNotes',
  'supplierPricing',
] as const;

function translateKnown(
  t: ReturnType<typeof useTranslations>,
  prefix: string,
  value: string,
  known: readonly string[],
): string {
  return known.includes(value) ? t(`${prefix}.${value}` as never) : value;
}

function GrantTable({
  grants,
  canEdit,
  kind,
  revokeAction,
  revokePending,
}: {
  grants: ExternalAccessGrantListItem[];
  canEdit: boolean;
  kind: 'customer' | 'vendor';
  revokeAction: (payload: FormData) => void;
  revokePending: boolean;
}) {
  const t = useTranslations('portal');

  if (grants.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--pf-text-muted)]">
        {kind === 'customer' ? t('empty') : t('vendorEmpty')}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <ResponsiveTable
        items={grants}
        getRowKey={(grant) => grant.id}
        desktop={
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.principal')}</TableHead>
                  <TableHead>{t('columns.scope')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="min-w-0 max-w-[16rem]">
                      <div className="break-all font-medium pf-ltr-island" dir="ltr">
                        {grant.principalEmail}
                      </div>
                      <div className="truncate text-xs text-[var(--pf-text-muted)]">
                        {kind === 'customer'
                          ? [grant.clientName, grant.projectName].filter(Boolean).join(' · ') ||
                            t('fields.none')
                          : grant.vendorName || t('fields.none')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {grant.scopes.map((scope) => (
                          <Badge key={scope} tone="neutral">
                            {t(`scopes.${scope}` as 'scopes.project.summary')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{t(`statuses.${grant.status}`)}</TableCell>
                    <TableCell>
                      {canEdit && grant.status === 'active' ? (
                        <form action={revokeAction}>
                          <input type="hidden" name="grantId" value={grant.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            loading={revokePending}
                            className="min-h-11 md:min-h-8"
                            aria-label={t('revokeNamed', { email: grant.principalEmail })}
                          >
                            {t('revoke')}
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(grant) => (
          <div className="flex min-h-11 min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
            <div className="min-w-0">
              <p className="break-all font-semibold pf-ltr-island" dir="ltr">
                {grant.principalEmail}
              </p>
              <p className="mt-1 break-words text-sm text-[var(--pf-text-secondary)]">
                {kind === 'customer'
                  ? [grant.clientName, grant.projectName].filter(Boolean).join(' · ') ||
                    t('fields.none')
                  : grant.vendorName || t('fields.none')}
              </p>
              <p className="mt-1 text-sm">{t(`statuses.${grant.status}`)}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {grant.scopes.map((scope) => (
                <Badge key={scope} tone="neutral">
                  {t(`scopes.${scope}` as 'scopes.project.summary')}
                </Badge>
              ))}
            </div>
            {canEdit && grant.status === 'active' ? (
              <form action={revokeAction}>
                <input type="hidden" name="grantId" value={grant.id} />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  loading={revokePending}
                  className="min-h-11"
                  aria-label={t('revokeNamed', { email: grant.principalEmail })}
                >
                  {t('revoke')}
                </Button>
              </form>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}

function CustomerSafePreview({
  projects,
  customerGrants,
}: {
  projects: { id: string; name: string }[];
  customerGrants: ExternalAccessGrantListItem[];
}) {
  const t = useTranslations('portal');
  const tStatus = useTranslations('status');
  const tProgress = useTranslations('projects.details');
  const [state, action, pending] = useActionState(
    previewCustomerSafeSummaryAction,
    {} as PortalPreviewState,
  );
  const activeGrants = customerGrants.filter((grant) => grant.status === 'active');
  const summary = state.summary;

  return (
    <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h3 className="font-medium">{t('preview.title')}</h3>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('preview.subtitle')}</p>
      <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('preview.grantHint')}</p>

      <form action={action} className="mt-3 flex w-full max-w-lg flex-col gap-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label={t('fields.project')} required>
          {(props) => (
            <Select name="projectId" defaultValue="none" required>
              <SelectTrigger id={props.id}>
                <SelectValue placeholder={t('fields.none')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('fields.none')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('preview.grantOptional')}>
          {(props) => (
            <Select name="grantId" defaultValue="none">
              <SelectTrigger id={props.id}>
                <SelectValue placeholder={t('fields.none')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('fields.none')}</SelectItem>
                {activeGrants.map((grant) => (
                  <SelectItem key={grant.id} value={grant.id}>
                    <span dir="ltr" className="pf-ltr-island">
                      {grant.principalEmail}
                    </span>
                    {grant.projectName || grant.clientName
                      ? ` · ${[grant.projectName, grant.clientName].filter(Boolean).join(' / ')}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Button type="submit" variant="secondary" loading={pending} className="min-h-11 w-full sm:w-auto">
          {t('preview.run')}
        </Button>
      </form>

      {summary ? (
        <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.name')}</dt>
            <dd className="break-words font-medium">{summary.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.status')}</dt>
            <dd>
              {translateKnown(tStatus, 'project', summary.status, PROJECT_STATUS_KEYS)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.client')}</dt>
            <dd className="break-words">{summary.clientName ?? '-'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.progress')}</dt>
            <dd>
              {summary.progressPercent != null ? (
                <span dir="ltr" className="pf-numeric">
                  {summary.progressPercent}%
                </span>
              ) : (
                '-'
              )}
              {summary.progressStatus ? (
                <>
                  {' · '}
                  <span>
                    {translateKnown(
                      tProgress,
                      'progressStatuses',
                      summary.progressStatus,
                      PROGRESS_STATUS_KEYS,
                    )}
                  </span>
                </>
              ) : null}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.dates')}</dt>
            <dd dir="ltr" className="pf-ltr-island">
              {[summary.startDate, summary.targetEndDate].filter(Boolean).join(' → ') || '-'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.location')}</dt>
            <dd className="break-words">{summary.location ?? '-'}</dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.description')}</dt>
            <dd className="break-words">{summary.description ?? '-'}</dd>
          </div>
          {summary.outstanding ? (
            <div className="min-w-0">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.outstanding')}</dt>
              <dd dir="ltr" className="pf-numeric">
                {summary.outstanding.amount} {summary.outstanding.currency}
              </dd>
            </div>
          ) : null}
          {summary.billing ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.billing')}</dt>
              <dd className="mt-1 text-sm">
                <span dir="ltr" className="pf-numeric">
                  {summary.billing.invoicedAmount} / {summary.billing.paidAmount}{' '}
                  {summary.billing.currency}
                </span>
                {summary.billing.items.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-[var(--pf-text-muted)]">
                    {summary.billing.items.slice(0, 5).map((item) => (
                      <li key={item.billingRecordId} dir="ltr" className="pf-ltr-island">
                        {item.reference ?? item.billingRecordId.slice(0, 8)} · {item.totalAmount}{' '}
                        {item.currency}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </dd>
            </div>
          ) : null}
          {summary.milestones?.length ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.milestones')}</dt>
              <dd>
                <ul className="mt-1 flex flex-col gap-1">
                  {summary.milestones.map((milestone) => (
                    <li key={milestone.milestoneId} className="break-words text-sm">
                      {milestone.name} · {milestone.status}
                      {milestone.targetDate ? ` · ${milestone.targetDate}` : ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : state.scopesApplied?.includes('milestones.read') ? (
            <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
              {t('preview.noMilestones')}
            </div>
          ) : null}
          {summary.quotes?.length ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.quotes')}</dt>
              <dd>
                <ul className="mt-1 flex flex-col gap-1">
                  {summary.quotes.map((quote) => (
                    <li key={quote.quoteId} className="break-words text-sm">
                      {quote.title} · {quote.status}
                      {quote.totalAmount ? (
                        <span dir="ltr" className="pf-numeric">
                          {' '}
                          · {quote.totalAmount} {quote.currency}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : state.scopesApplied?.includes('quotes.read') ? (
            <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
              {t('preview.noQuotes')}
            </div>
          ) : null}
          {(summary.documents ?? state.documents)?.length ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.documents')}</dt>
              <dd>
                <ul className="mt-1 flex flex-col gap-1">
                  {(summary.documents ?? state.documents ?? []).map((doc) => (
                    <li key={doc.documentId} className="break-all text-sm pf-ltr-island" dir="ltr">
                      {doc.filename}
                      {doc.label ? ` · ${doc.label}` : ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : state.scopesApplied?.includes('documents.read') ? (
            <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
              {t('preview.noDocuments')}
            </div>
          ) : null}
          {state.scopesApplied && state.scopesApplied.length > 0 ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.scopesApplied')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {state.scopesApplied.map((scope) => (
                  <Badge key={scope} tone="neutral">
                    {t(`scopes.${scope}` as 'scopes.project.summary')}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.neverExposed')}</dt>
            <dd className="text-xs text-[var(--pf-text-muted)]">
              {(state.neverExposed ?? NEVER_EXPOSED_KEYS).map((key) =>
                translateKnown(t, 'preview.neverExposedItems', key, NEVER_EXPOSED_KEYS),
              ).join(' · ')}
            </dd>
          </div>
          <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
            {t('preview.foundationNote')}
          </div>
        </dl>
      ) : !state.error ? (
        <p className="mt-3 text-sm text-[var(--pf-text-muted)]">{t('preview.empty')}</p>
      ) : (
        <p className="mt-3 text-xs text-[var(--pf-text-muted)]">{t('preview.foundationNote')}</p>
      )}
    </section>
  );
}

function VendorSafePreview({
  vendorGrants,
}: {
  vendorGrants: ExternalAccessGrantListItem[];
}) {
  const t = useTranslations('portal');
  const tProcurement = useTranslations('procurement');
  const [state, action, pending] = useActionState(
    previewVendorPortalAction,
    {} as VendorPortalPreviewState,
  );
  const activeGrants = vendorGrants.filter((grant) => grant.status === 'active');
  const preview = state.preview;

  return (
    <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h3 className="font-medium">{t('vendorPreview.title')}</h3>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('vendorPreview.subtitle')}</p>

      <form action={action} className="mt-3 flex w-full max-w-lg flex-col gap-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Field label={t('vendorPreview.grant')} required>
          {(props) => (
            <Select name="grantId" defaultValue="none" required>
              <SelectTrigger id={props.id}>
                <SelectValue placeholder={t('fields.none')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('fields.none')}</SelectItem>
                {activeGrants.map((grant) => (
                  <SelectItem key={grant.id} value={grant.id}>
                    <span dir="ltr" className="pf-ltr-island">
                      {grant.principalEmail}
                    </span>
                    {grant.vendorName ? ` · ${grant.vendorName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Button type="submit" loading={pending} className="min-h-11 w-full sm:w-auto">
          {t('vendorPreview.run')}
        </Button>
      </form>

      {preview ? (
        <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.vendor')}</dt>
            <dd className="break-words">{preview.vendorName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.scopes')}</dt>
            <dd>
              {preview.scopes.length > 0 ? (
                <ul className="flex flex-wrap gap-1">
                  {preview.scopes.map((scope) => (
                    <li key={scope}>
                      <Badge tone="neutral">{t(`scopes.${scope}` as 'scopes.vendor.summary')}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                '-'
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.rfqCount')}</dt>
            <dd dir="ltr" className="pf-numeric">
              {preview.rfqs.length}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.poCount')}</dt>
            <dd dir="ltr" className="pf-numeric">
              {preview.purchaseOrders.length}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.apCandidates')}</dt>
            <dd dir="ltr" className="pf-numeric">
              {preview.apBillCandidates.length}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.complianceCandidates')}</dt>
            <dd dir="ltr" className="pf-numeric">
              {preview.complianceCandidates.length}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.intakeNote')}</dt>
            <dd>{t('vendorPreview.candidatesOnly')}</dd>
          </div>
          <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
            {t('vendorPreview.rfqVisibilityNote')}
          </div>
          {preview.rfqs.length > 0 ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="mb-1 text-[var(--pf-text-secondary)]">{t('vendorPreview.rfqList')}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {preview.rfqs.slice(0, 5).map((rfq) => (
                    <li
                      key={rfq.rfqId}
                      className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] p-2 text-xs"
                    >
                      <span className="font-medium">{rfq.title}</span>
                      <span className="text-[var(--pf-text-muted)]">
                        {' · '}
                        {translateKnown(
                          tProcurement,
                          'rfq.statuses',
                          rfq.status,
                          RFQ_STATUS_KEYS,
                        )}
                        {rfq.projectName ? ` · ${rfq.projectName}` : ''}
                        {rfq.dueDate ? (
                          <>
                            {' · '}
                            <span dir="ltr" className="pf-ltr-island">
                              {rfq.dueDate}
                            </span>
                          </>
                        ) : null}
                        {' · '}
                        <span dir="ltr" className="pf-numeric">
                          {rfq.lines.length}
                        </span>{' '}
                        {t('vendorPreview.lines')}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {preview.purchaseOrders.length > 0 ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="mb-1 text-[var(--pf-text-secondary)]">{t('vendorPreview.poList')}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {preview.purchaseOrders.slice(0, 5).map((po) => (
                    <li
                      key={po.purchaseOrderId}
                      className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] p-2 text-xs"
                    >
                      <span className="font-medium pf-ltr-island" dir="ltr">
                        {po.reference ?? po.purchaseOrderId}
                      </span>
                      <span className="text-[var(--pf-text-muted)]">
                        {' · '}
                        {translateKnown(tProcurement, 'statuses', po.status, PO_STATUS_KEYS)}
                        {' · '}
                        <span dir="ltr" className="pf-numeric">
                          {po.orderTotal} {po.currency}
                        </span>
                        {po.projectName ? ` · ${po.projectName}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : !state.error ? (
        <p className="mt-3 text-sm text-[var(--pf-text-muted)]">{t('vendorPreview.empty')}</p>
      ) : null}
    </section>
  );
}

function VendorCandidateForms({
  vendorGrants,
  defaultCurrency,
}: {
  vendorGrants: ExternalAccessGrantListItem[];
  defaultCurrency: string;
}) {
  const t = useTranslations('portal');
  const activeGrants = vendorGrants.filter((grant) => grant.status === 'active');
  const [apState, apAction, apPending] = useActionState(
    submitVendorApBillCandidateAction,
    {} as PortalActionState,
  );
  const [docState, docAction, docPending] = useActionState(
    submitVendorComplianceCandidateAction,
    {} as PortalActionState,
  );
  const [quoteState, quoteAction, quotePending] = useActionState(
    submitVendorQuoteCandidateAction,
    {} as PortalActionState,
  );

  if (activeGrants.length === 0) return null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4 lg:col-span-2">
        <h3 className="font-medium">{t('candidateQuote.title')}</h3>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('candidateQuote.hint')}</p>
        <form action={quoteAction} className="mt-3 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {quoteState.error ? (
            <Alert tone="danger" className="sm:col-span-2">
              {quoteState.error}
            </Alert>
          ) : null}
          {quoteState.ok ? (
            <Alert tone="success" role="status" className="sm:col-span-2">
              {t('candidateQuote.saved')}
            </Alert>
          ) : null}
          <Field label={t('vendorPreview.grant')} required>
            {(props) => (
              <Select name="grantId" required>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.none')} />
                </SelectTrigger>
                <SelectContent>
                  {activeGrants.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      <span dir="ltr" className="pf-ltr-island">
                        {grant.principalEmail}
                      </span>
                      {grant.vendorName ? ` · ${grant.vendorName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t('fields.vendor')} required>
            {(props) => (
              <Select name="vendorId" required defaultValue={activeGrants[0]?.vendorId ?? undefined}>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {[...new Map(activeGrants.map((g) => [g.vendorId, g])).values()].map((grant) =>
                    grant.vendorId ? (
                      <SelectItem key={grant.vendorId} value={grant.vendorId}>
                        {grant.vendorName || grant.vendorId}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            )}
          </Field>
          <input type="hidden" name="currency" value={defaultCurrency} />
          <Field label={t('fields.totalAmount')} required>
            {(props) => <Input {...props} name="totalAmount" numeric required />}
          </Field>
          <Field label={t('fields.lineDescription')} required>
            {(props) => <Input {...props} name="lineDescription" required />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={quotePending} className="min-h-11 w-full sm:w-auto">
              {t('candidateQuote.submit')}
            </Button>
          </div>
        </form>
      </section>
      <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h3 className="font-medium">{t('candidateAp.title')}</h3>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('candidateAp.hint')}</p>
        <form action={apAction} className="mt-3 flex flex-col gap-3">
          {apState.error ? <Alert tone="danger">{apState.error}</Alert> : null}
          {apState.ok ? (
            <Alert tone="success" role="status">
              {t('candidateAp.saved')}
            </Alert>
          ) : null}
          <Field label={t('vendorPreview.grant')} required>
            {(props) => (
              <Select name="grantId" required>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.none')} />
                </SelectTrigger>
                <SelectContent>
                  {activeGrants.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      <span dir="ltr" className="pf-ltr-island">
                        {grant.principalEmail}
                      </span>
                      {grant.vendorName ? ` · ${grant.vendorName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t('fields.vendor')} required>
            {(props) => (
              <Select name="vendorId" required defaultValue={activeGrants[0]?.vendorId ?? undefined}>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {[...new Map(activeGrants.map((g) => [g.vendorId, g])).values()].map((grant) =>
                    grant.vendorId ? (
                      <SelectItem key={grant.vendorId} value={grant.vendorId}>
                        {grant.vendorName || grant.vendorId}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            )}
          </Field>
          <input type="hidden" name="currency" value={defaultCurrency} />
          <Field label={t('fields.totalAmount')} required>
            {(props) => <Input {...props} name="totalAmount" numeric required />}
          </Field>
          <Field label={t('fields.lineDescription')} required>
            {(props) => <Input {...props} name="lineDescription" required />}
          </Field>
          <Field label={t('candidateAp.reference')}>
            {(props) => <Input {...props} name="reference" dir="ltr" className="pf-ltr-island" />}
          </Field>
          <Button type="submit" loading={apPending} className="min-h-11 w-full sm:w-auto">
            {t('candidateAp.submit')}
          </Button>
        </form>
      </section>
      <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h3 className="font-medium">{t('candidateCompliance.title')}</h3>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('candidateCompliance.hint')}</p>
        <form action={docAction} className="mt-3 flex flex-col gap-3">
          {docState.error ? <Alert tone="danger">{docState.error}</Alert> : null}
          {docState.ok ? (
            <Alert tone="success" role="status">
              {t('candidateCompliance.saved')}
            </Alert>
          ) : null}
          <Field label={t('vendorPreview.grant')} required>
            {(props) => (
              <Select name="grantId" required>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.none')} />
                </SelectTrigger>
                <SelectContent>
                  {activeGrants.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      <span dir="ltr" className="pf-ltr-island">
                        {grant.principalEmail}
                      </span>
                      {grant.vendorName ? ` · ${grant.vendorName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t('fields.vendor')} required>
            {(props) => (
              <Select name="vendorId" required defaultValue={activeGrants[0]?.vendorId ?? undefined}>
                <SelectTrigger id={props.id}>
                  <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {[...new Map(activeGrants.map((g) => [g.vendorId, g])).values()].map((grant) =>
                    grant.vendorId ? (
                      <SelectItem key={grant.vendorId} value={grant.vendorId}>
                        {grant.vendorName || grant.vendorId}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t('candidateCompliance.kind')} required>
            {(props) => (
              <Select name="artifactKind" defaultValue="insurance" required>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insurance">{t('candidateCompliance.kinds.insurance')}</SelectItem>
                  <SelectItem value="license">{t('candidateCompliance.kinds.license')}</SelectItem>
                  <SelectItem value="certification">
                    {t('candidateCompliance.kinds.certification')}
                  </SelectItem>
                  <SelectItem value="other">{t('candidateCompliance.kinds.other')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t('candidateCompliance.name')} required>
            {(props) => <Input {...props} name="name" required />}
          </Field>
          <Field label={t('candidateCompliance.reference')}>
            {(props) => (
              <Input {...props} name="referenceNumber" dir="ltr" className="pf-ltr-island" />
            )}
          </Field>
          <Button type="submit" loading={docPending} className="min-h-11 w-full sm:w-auto">
            {t('candidateCompliance.submit')}
          </Button>
        </form>
      </section>
    </div>
  );
}

function VendorCandidateReviewQueue({
  apBillCandidates,
  complianceCandidates,
  canEdit,
}: {
  apBillCandidates: readonly VendorApBillCandidate[];
  complianceCandidates: readonly VendorComplianceUploadCandidate[];
  canEdit: boolean;
}) {
  const t = useTranslations('portal');
  const [state, action, pending] = useActionState(
    reviewVendorCandidateAction,
    {} as PortalActionState,
  );

  const pendingAp = apBillCandidates.filter((row) => row.status === 'candidate');
  const pendingCompliance = complianceCandidates.filter((row) => row.status === 'candidate');
  const reviewed = [
    ...apBillCandidates.filter((row) => row.status !== 'candidate'),
    ...complianceCandidates.filter((row) => row.status !== 'candidate'),
  ];

  if (pendingAp.length === 0 && pendingCompliance.length === 0 && reviewed.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h3 className="font-medium">{t('candidateReview.title')}</h3>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('candidateReview.subtitle')}</p>
      <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('candidateReview.neverPosts')}</p>

      {state.error ? <Alert tone="danger" className="mt-3">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" className="mt-3" role="status">
          {t('candidateReview.saved')}
        </Alert>
      ) : null}

      <ul className="mt-3 flex flex-col gap-3">
        {pendingAp.map((candidate) => (
          <li
            key={candidate.id}
            className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
          >
            <p className="font-medium">
              {t('candidateReview.apLabel')} ·{' '}
              <span dir="ltr" className="pf-numeric">
                {candidate.totalAmount} {candidate.currency}
              </span>
            </p>
            <p className="text-[var(--pf-text-secondary)]">
              {candidate.reference ? (
                <span dir="ltr" className="break-all pf-ltr-island">
                  {candidate.reference}
                </span>
              ) : (
                t('fields.none')
              )}
            </p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="ap_bill" />
                  <input type="hidden" name="decision" value="accepted_for_review" />
                  <Button type="submit" size="sm" loading={pending} className="min-h-11 md:min-h-8">
                    {t('candidateReview.accept')}
                  </Button>
                </form>
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="ap_bill" />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    className="min-h-11 md:min-h-8"
                  >
                    {t('candidateReview.reject')}
                  </Button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
        {pendingCompliance.map((candidate) => (
          <li
            key={candidate.id}
            className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
          >
            <p className="font-medium">{t('candidateReview.complianceLabel')} · {candidate.name}</p>
            <p className="text-[var(--pf-text-secondary)]">
              {ARTIFACT_KIND_KEYS.includes(
                candidate.artifactKind as (typeof ARTIFACT_KIND_KEYS)[number],
              )
                ? t(`candidateCompliance.kinds.${candidate.artifactKind}` as 'candidateCompliance.kinds.insurance')
                : candidate.artifactKind}
            </p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="compliance" />
                  <input type="hidden" name="decision" value="accepted_for_review" />
                  <Button type="submit" size="sm" loading={pending} className="min-h-11 md:min-h-8">
                    {t('candidateReview.accept')}
                  </Button>
                </form>
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="compliance" />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    className="min-h-11 md:min-h-8"
                  >
                    {t('candidateReview.reject')}
                  </Button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {reviewed.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--pf-text-muted)]">
          {t('candidateReview.reviewedCount', { count: reviewed.length })}
        </p>
      ) : null}
    </section>
  );
}

export function PortalGrantsPanel({
  customerGrants,
  vendorGrants,
  clients,
  projects,
  vendors,
  apBillCandidates = [],
  complianceCandidates = [],
  canEdit,
  canRecordQuote,
  defaultCurrency,
}: {
  customerGrants: ExternalAccessGrantListItem[];
  vendorGrants: ExternalAccessGrantListItem[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  apBillCandidates?: readonly VendorApBillCandidate[];
  complianceCandidates?: readonly VendorComplianceUploadCandidate[];
  canEdit: boolean;
  canRecordQuote: boolean;
  defaultCurrency: string;
}) {
  const t = useTranslations('portal');
  const [createState, createAction, createPending] = useActionState(
    createCustomerGrantAction,
    {} as PortalActionState,
  );
  const [vendorCreateState, vendorCreateAction, vendorCreatePending] = useActionState(
    createVendorGrantAction,
    {} as PortalActionState,
  );
  const [quoteState, quoteAction, quotePending] = useActionState(
    recordVendorQuoteOnBehalfAction,
    {} as PortalActionState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeCustomerGrantAction,
    {} as PortalActionState,
  );
  const [vendorRevokeState, vendorRevokeAction, vendorRevokePending] = useActionState(
    revokeVendorGrantAction,
    {} as PortalActionState,
  );

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Alert tone="warning">
        <p className="font-medium">{t('publicDisabled.title')}</p>
        <p>{t('publicDisabled.body')}</p>
      </Alert>
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('externalNote')}</p>
      </div>

      <section className="flex min-w-0 flex-col gap-6">
        <h2 className="text-base font-semibold">{t('customerSection')}</h2>

        {canEdit ? (
          <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addGrant')}</h3>
            <form action={createAction} className="mt-3 flex w-full max-w-lg flex-col gap-3">
              {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
              {createState.ok ? (
                <Alert tone="success" role="status">
                  {t('saved')}
                </Alert>
              ) : null}

              <Field label={t('fields.email')} required>
                {(props) => (
                  <Input
                    {...props}
                    name="email"
                    type="email"
                    required
                    dir="ltr"
                    className="pf-ltr-island"
                    autoComplete="email"
                  />
                )}
              </Field>
              <Field label={t('fields.displayName')}>
                {(props) => <Input {...props} name="displayName" />}
              </Field>

              <Field label={t('fields.client')}>
                {(props) => (
                  <Select name="clientId" defaultValue="none">
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder={t('fields.none')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('fields.none')}</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label={t('fields.project')}>
                {(props) => (
                  <Select name="projectId" defaultValue="none">
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder={t('fields.none')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('fields.none')}</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
                {CUSTOMER_PORTAL_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 min-w-0 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope}
                      defaultChecked={scope === 'project.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    <span className="min-w-0 break-words">{t(`scopes.${scope}`)}</span>
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => (
                  <Input
                    {...props}
                    name="expiresAt"
                    type="datetime-local"
                    dir="ltr"
                    className="pf-ltr-island"
                  />
                )}
              </Field>

              <Button type="submit" loading={createPending} className="min-h-11 w-full sm:w-auto">
                {t('addGrant')}
              </Button>
            </form>
          </section>
        ) : null}

        <CustomerSafePreview projects={projects} customerGrants={customerGrants} />

        <section>
          <h3 className="text-sm font-semibold">{t('listTitle')}</h3>
          {revokeState.error ? <Alert tone="danger">{revokeState.error}</Alert> : null}
          <GrantTable
            grants={customerGrants}
            canEdit={canEdit}
            kind="customer"
            revokeAction={revokeAction}
            revokePending={revokePending}
          />
        </section>
      </section>

      <section className="flex min-w-0 flex-col gap-6 border-t border-[var(--pf-border-default)] pt-8">
        <div>
          <h2 className="text-base font-semibold">{t('vendorSection')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('vendorSubtitle')}</p>
          <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('vendorFoundationNote')}</p>
        </div>

        {canEdit ? (
          <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addVendorGrant')}</h3>
            <form action={vendorCreateAction} className="mt-3 flex w-full max-w-lg flex-col gap-3">
              {vendorCreateState.error ? (
                <Alert tone="danger">{vendorCreateState.error}</Alert>
              ) : null}
              {vendorCreateState.ok ? (
                <Alert tone="success" role="status">
                  {t('vendorSaved')}
                </Alert>
              ) : null}

              <Field label={t('fields.vendorEmail')} required>
                {(props) => (
                  <Input
                    {...props}
                    name="email"
                    type="email"
                    required
                    dir="ltr"
                    className="pf-ltr-island"
                    autoComplete="email"
                  />
                )}
              </Field>
              <Field label={t('fields.displayName')}>
                {(props) => <Input {...props} name="displayName" />}
              </Field>

              <Field label={t('fields.vendor')} required>
                {(props) => (
                  <Select name="vendorId" required>
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
                {VENDOR_PORTAL_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 min-w-0 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="vendorScopes"
                      value={scope}
                      defaultChecked={scope === 'vendor.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    <span className="min-w-0 break-words">{t(`scopes.${scope}`)}</span>
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => (
                  <Input
                    {...props}
                    name="expiresAt"
                    type="datetime-local"
                    dir="ltr"
                    className="pf-ltr-island"
                  />
                )}
              </Field>

              <Button
                type="submit"
                loading={vendorCreatePending}
                className="min-h-11 w-full sm:w-auto"
              >
                {t('addVendorGrant')}
              </Button>
            </form>
          </section>
        ) : null}

        {canRecordQuote && vendors.length > 0 ? (
          <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('recordQuoteTitle')}</h3>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('recordQuoteHint')}</p>
            <form action={quoteAction} className="mt-3 flex w-full max-w-lg flex-col gap-3">
              {quoteState.error ? <Alert tone="danger">{quoteState.error}</Alert> : null}
              {quoteState.ok ? (
                <Alert tone="success" role="status">
                  {t('recordQuoteSaved')}
                </Alert>
              ) : null}

              <Field label={t('fields.vendor')} required>
                {(props) => (
                  <Select name="vendorId" required>
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <input type="hidden" name="currency" value={defaultCurrency} />
              <Field label={t('fields.totalAmount')} required>
                {(props) => (
                  <Input {...props} name="totalAmount" numeric required defaultValue="0" />
                )}
              </Field>
              <Field label={t('fields.lineDescription')} required>
                {(props) => <Input {...props} name="lineDescription" required />}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('fields.lineQuantity')}>
                  {(props) => (
                    <Input {...props} name="lineQuantity" numeric defaultValue="1" />
                  )}
                </Field>
                <Field label={t('fields.lineUnitAmount')}>
                  {(props) => <Input {...props} name="lineUnitAmount" numeric />}
                </Field>
              </div>
              <Field label={t('fields.lineTotal')}>
                {(props) => <Input {...props} name="lineTotal" numeric />}
              </Field>
              <Field label={t('fields.receivedOn')}>
                {(props) => (
                  <Input {...props} name="receivedOn" type="date" dir="ltr" className="pf-ltr-island" />
                )}
              </Field>
              <Field label={t('fields.quoteNotes')}>
                {(props) => <Input {...props} name="notes" />}
              </Field>

              <Button type="submit" loading={quotePending} className="min-h-11 w-full sm:w-auto">
                {t('recordQuoteSubmit')}
              </Button>
            </form>
          </section>
        ) : null}

        <VendorSafePreview vendorGrants={vendorGrants} />
        {canEdit ? (
          <VendorCandidateForms vendorGrants={vendorGrants} defaultCurrency={defaultCurrency} />
        ) : null}
        <VendorCandidateReviewQueue
          apBillCandidates={apBillCandidates}
          complianceCandidates={complianceCandidates}
          canEdit={canEdit}
        />

        <section>
          <h3 className="text-sm font-semibold">{t('vendorListTitle')}</h3>
          {vendorRevokeState.error ? <Alert tone="danger">{vendorRevokeState.error}</Alert> : null}
          <GrantTable
            grants={vendorGrants}
            canEdit={canEdit}
            kind="vendor"
            revokeAction={vendorRevokeAction}
            revokePending={vendorRevokePending}
          />
        </section>
      </section>
    </div>
  );
}
