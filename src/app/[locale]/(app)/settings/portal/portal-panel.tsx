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
                    <TableCell>
                      <div className="font-medium" dir="ltr">
                        {grant.principalEmail}
                      </div>
                      <div className="text-xs text-[var(--pf-text-muted)]">
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
          <div className="flex min-h-11 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
            <div>
              <p className="font-semibold" dir="ltr">
                {grant.principalEmail}
              </p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
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
  const [state, action, pending] = useActionState(
    previewCustomerSafeSummaryAction,
    {} as PortalPreviewState,
  );
  const activeGrants = customerGrants.filter((grant) => grant.status === 'active');
  const summary = state.summary;

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
      <h3 className="font-medium">{t('preview.title')}</h3>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('preview.subtitle')}</p>
      <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('preview.grantHint')}</p>

      <form action={action} className="mt-3 flex max-w-lg flex-col gap-3">
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
                    {grant.principalEmail}
                    {grant.projectName || grant.clientName
                      ? ` · ${[grant.projectName, grant.clientName].filter(Boolean).join(' / ')}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Button type="submit" variant="secondary" loading={pending}>
          {t('preview.run')}
        </Button>
      </form>

      {summary ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.name')}</dt>
            <dd className="font-medium">{summary.name}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.status')}</dt>
            <dd>{summary.status}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.client')}</dt>
            <dd>{summary.clientName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.progress')}</dt>
            <dd>
              {summary.progressPercent != null ? `${summary.progressPercent}%` : '—'}
              {summary.progressStatus ? ` · ${summary.progressStatus}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.dates')}</dt>
            <dd dir="ltr">
              {[summary.startDate, summary.targetEndDate].filter(Boolean).join(' → ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.location')}</dt>
            <dd>{summary.location ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.description')}</dt>
            <dd>{summary.description ?? '—'}</dd>
          </div>
          {summary.outstanding ? (
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.outstanding')}</dt>
              <dd dir="ltr">
                {summary.outstanding.amount} {summary.outstanding.currency}
              </dd>
            </div>
          ) : null}
          {(summary.documents ?? state.documents)?.length ? (
            <div className="sm:col-span-2">
              <dt className="text-[var(--pf-text-secondary)]">{t('preview.fields.documents')}</dt>
              <dd>
                <ul className="mt-1 flex flex-col gap-1">
                  {(summary.documents ?? state.documents ?? []).map((doc) => (
                    <li key={doc.documentId} className="text-sm" dir="ltr">
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
            <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('preview.neverExposed')}</dt>
            <dd className="text-xs text-[var(--pf-text-muted)]">
              {(state.neverExposed ?? ['profit', 'employeeCost', 'overhead', 'admin']).join(' · ')}
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
  const [state, action, pending] = useActionState(
    previewVendorPortalAction,
    {} as VendorPortalPreviewState,
  );
  const activeGrants = vendorGrants.filter((grant) => grant.status === 'active');
  const preview = state.preview;

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
      <h3 className="font-medium">{t('vendorPreview.title')}</h3>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('vendorPreview.subtitle')}</p>

      <form action={action} className="mt-3 flex max-w-lg flex-col gap-3">
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
                    {grant.principalEmail}
                    {grant.vendorName ? ` · ${grant.vendorName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Button type="submit" loading={pending}>
          {t('vendorPreview.run')}
        </Button>
      </form>

      {preview ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.vendor')}</dt>
            <dd>{preview.vendorName}</dd>
          </div>
          <div>
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
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.rfqCount')}</dt>
            <dd>{preview.rfqs.length}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.poCount')}</dt>
            <dd>{preview.purchaseOrders.length}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.apCandidates')}</dt>
            <dd>{preview.apBillCandidates.length}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.complianceCandidates')}</dt>
            <dd>{preview.complianceCandidates.length}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--pf-text-secondary)]">{t('vendorPreview.intakeNote')}</dt>
            <dd>{t('vendorPreview.candidatesOnly')}</dd>
          </div>
          <div className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
            {t('vendorPreview.rfqVisibilityNote')}
          </div>
          {preview.rfqs.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="mb-1 text-[var(--pf-text-secondary)]">{t('vendorPreview.rfqList')}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {preview.rfqs.slice(0, 5).map((rfq) => (
                    <li
                      key={rfq.rfqId}
                      className="rounded-md border border-[var(--pf-border-default)] p-2 text-xs"
                    >
                      <span className="font-medium">{rfq.title}</span>
                      <span className="text-[var(--pf-text-muted)]">
                        {' · '}
                        {rfq.status}
                        {rfq.projectName ? ` · ${rfq.projectName}` : ''}
                        {rfq.dueDate ? (
                          <>
                            {' · '}
                            <span dir="ltr">{rfq.dueDate}</span>
                          </>
                        ) : null}
                        {` · ${rfq.lines.length} ${t('vendorPreview.lines')}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {preview.purchaseOrders.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="mb-1 text-[var(--pf-text-secondary)]">{t('vendorPreview.poList')}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {preview.purchaseOrders.slice(0, 5).map((po) => (
                    <li
                      key={po.purchaseOrderId}
                      className="rounded-md border border-[var(--pf-border-default)] p-2 text-xs"
                    >
                      <span className="font-medium">{po.reference ?? po.purchaseOrderId}</span>
                      <span className="text-[var(--pf-text-muted)]">
                        {' · '}
                        {po.status}
                        {' · '}
                        <span dir="ltr">
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
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-[var(--pf-border-default)] p-4 lg:col-span-2">
        <h3 className="font-medium">{t('candidateQuote.title')}</h3>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('candidateQuote.hint')}</p>
        <form action={quoteAction} className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
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
                      {grant.principalEmail}
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
            {(props) => <Input {...props} name="totalAmount" dir="ltr" required />}
          </Field>
          <Field label={t('fields.lineDescription')} required>
            {(props) => <Input {...props} name="lineDescription" required />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={quotePending}>
              {t('candidateQuote.submit')}
            </Button>
          </div>
        </form>
      </section>
      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
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
                      {grant.principalEmail}
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
            {(props) => <Input {...props} name="totalAmount" dir="ltr" required />}
          </Field>
          <Field label={t('fields.lineDescription')} required>
            {(props) => <Input {...props} name="lineDescription" required />}
          </Field>
          <Field label={t('candidateAp.reference')}>
            {(props) => <Input {...props} name="reference" />}
          </Field>
          <Button type="submit" loading={apPending}>
            {t('candidateAp.submit')}
          </Button>
        </form>
      </section>
      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
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
                      {grant.principalEmail}
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
            {(props) => <Input {...props} name="referenceNumber" />}
          </Field>
          <Button type="submit" loading={docPending}>
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
    <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
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
            className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
          >
            <p className="font-medium">
              {t('candidateReview.apLabel')} · {candidate.totalAmount} {candidate.currency}
            </p>
            <p className="text-[var(--pf-text-secondary)]">
              {candidate.reference || t('fields.none')}
            </p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="ap_bill" />
                  <input type="hidden" name="decision" value="accepted_for_review" />
                  <Button type="submit" size="sm" loading={pending}>
                    {t('candidateReview.accept')}
                  </Button>
                </form>
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="ap_bill" />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button type="submit" size="sm" variant="secondary" loading={pending}>
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
            className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
          >
            <p className="font-medium">
              {t('candidateReview.complianceLabel')} · {candidate.name}
            </p>
            <p className="text-[var(--pf-text-secondary)]">{candidate.artifactKind}</p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="compliance" />
                  <input type="hidden" name="decision" value="accepted_for_review" />
                  <Button type="submit" size="sm" loading={pending}>
                    {t('candidateReview.accept')}
                  </Button>
                </form>
                <form action={action}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="kind" value="compliance" />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button type="submit" size="sm" variant="secondary" loading={pending}>
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
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('externalNote')}</p>
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">{t('customerSection')}</h2>

        {canEdit ? (
          <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addGrant')}</h3>
            <form action={createAction} className="mt-3 flex max-w-lg flex-col gap-3">
              {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
              {createState.ok ? (
                <Alert tone="success" role="status">
                  {t('saved')}
                </Alert>
              ) : null}

              <Field label={t('fields.email')} required>
                {(props) => <Input {...props} name="email" type="email" dir="ltr" required />}
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
                  <label key={scope} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope}
                      defaultChecked={scope === 'project.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    {t(`scopes.${scope}`)}
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => <Input {...props} name="expiresAt" type="datetime-local" dir="ltr" />}
              </Field>

              <Button type="submit" loading={createPending}>
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

      <section className="flex flex-col gap-6 border-t border-[var(--pf-border-default)] pt-8">
        <div>
          <h2 className="text-base font-semibold">{t('vendorSection')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('vendorSubtitle')}</p>
          <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('vendorFoundationNote')}</p>
        </div>

        {canEdit ? (
          <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addVendorGrant')}</h3>
            <form action={vendorCreateAction} className="mt-3 flex max-w-lg flex-col gap-3">
              {vendorCreateState.error ? (
                <Alert tone="danger">{vendorCreateState.error}</Alert>
              ) : null}
              {vendorCreateState.ok ? (
                <Alert tone="success" role="status">
                  {t('vendorSaved')}
                </Alert>
              ) : null}

              <Field label={t('fields.vendorEmail')} required>
                {(props) => <Input {...props} name="email" type="email" dir="ltr" required />}
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
                  <label key={scope} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="vendorScopes"
                      value={scope}
                      defaultChecked={scope === 'vendor.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    {t(`scopes.${scope}`)}
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => <Input {...props} name="expiresAt" type="datetime-local" dir="ltr" />}
              </Field>

              <Button type="submit" loading={vendorCreatePending}>
                {t('addVendorGrant')}
              </Button>
            </form>
          </section>
        ) : null}

        {canRecordQuote && vendors.length > 0 ? (
          <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('recordQuoteTitle')}</h3>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('recordQuoteHint')}</p>
            <form action={quoteAction} className="mt-3 flex max-w-lg flex-col gap-3">
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
                  <Input {...props} name="totalAmount" dir="ltr" required defaultValue="0" />
                )}
              </Field>
              <Field label={t('fields.lineDescription')} required>
                {(props) => <Input {...props} name="lineDescription" required />}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('fields.lineQuantity')}>
                  {(props) => (
                    <Input {...props} name="lineQuantity" dir="ltr" defaultValue="1" />
                  )}
                </Field>
                <Field label={t('fields.lineUnitAmount')}>
                  {(props) => <Input {...props} name="lineUnitAmount" dir="ltr" />}
                </Field>
              </div>
              <Field label={t('fields.lineTotal')}>
                {(props) => <Input {...props} name="lineTotal" dir="ltr" />}
              </Field>
              <Field label={t('fields.receivedOn')}>
                {(props) => <Input {...props} name="receivedOn" type="date" dir="ltr" />}
              </Field>
              <Field label={t('fields.quoteNotes')}>
                {(props) => <Input {...props} name="notes" />}
              </Field>

              <Button type="submit" loading={quotePending}>
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
