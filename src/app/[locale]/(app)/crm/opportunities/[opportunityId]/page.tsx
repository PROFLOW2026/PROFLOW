import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { canConvertOpportunity, getOpportunityById, nextActionUrgency } from '@/modules/crm';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate, formatInstant } from '@/shared/dates/format';
import { isBusinessDate } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { upsertEntityFieldValueAction } from '../../../settings/custom-fields/actions';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import {
  AcceptVersionButton,
  ConvertWonForm,
  IssueVersionButton,
  MarkLostForm,
  OpportunityEstimateForm,
  OpportunityFollowUpForm,
  OpportunityNoteForm,
  OpportunityQuoteForm,
} from './opportunity-actions';

function translateAuditAction(
  t: Awaited<ReturnType<typeof getTranslations<'settings.activity'>>>,
  action: string,
): string {
  const segments = action.split('.');
  if (segments.length === 2) {
    const nestedKey = `actions.${segments[0]}.${segments[1]}`;
    if (t.has(nestedKey)) return t(nestedKey);
  }
  const flatKey = `actions.${action}`;
  if (t.has(flatKey)) return t(flatKey);
  return action;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; opportunityId: string }>;
}): Promise<Metadata> {
  const { locale, opportunityId } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  try {
    const opportunity = await withOrgContext((context) => getOpportunityById(context, opportunityId));
    return { title: opportunity.name };
  } catch {
    return { title: t('nav.opportunities') };
  }
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const t = await getTranslations('crm');
  const tAudit = await getTranslations('settings.activity');
  const locale = await getLocale();

  let detail;
  let canManage = false;
  let defaultCurrency = 'ILS';
  let timezone = 'Asia/Jerusalem';
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  try {
    const result = await withOrgContext(async (context) => ({
      detail: await getOpportunityById(context, opportunityId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
      defaultCurrency: context.organization.baseCurrency,
      timezone: context.organization.timezone,
      customFields: await listCustomFieldValuesForEntity(context, 'opportunity', opportunityId).catch(
        () => [],
      ),
    }));
    detail = result.detail;
    canManage = result.canManage;
    defaultCurrency = result.defaultCurrency;
    timezone = result.timezone;
    customFields = result.customFields;
  } catch {
    notFound();
  }

  const currency = detail.currency ?? defaultCurrency;
  const acceptedVersion =
    detail.salesQuotes
      .flatMap((quote) => quote.versions)
      .find((version) => version.status === 'accepted') ?? null;
  const acceptedVersionId = acceptedVersion?.id ?? null;
  const convertible = canConvertOpportunity(detail);
  const convertReady = convertible && Boolean(acceptedVersionId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.name}
        meta={
          <>
            <StatusBadge
              shape={detail.status === 'open' ? 'active' : 'archived'}
              label={t(`statuses.opportunity.${detail.status}`)}
            />
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {t(`stages.${detail.stage}`)}
            </span>
          </>
        }
        breadcrumb={
          <Link href="/crm" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        actions={
          canManage && convertible ? (
            <Button asChild size="lg" variant={convertReady ? 'primary' : 'secondary'}>
              <a href="#convert-to-project">
                {convertReady ? t('convert.submit') : t('convert.blockedTitle')}
              </a>
            </Button>
          ) : null
        }
      />

      {canManage && convertible ? (
        <Card
          id="convert-to-project"
          className={
            convertReady
              ? 'border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)]'
              : 'border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)]'
          }
        >
          <CardHeader>
            <CardTitle className="text-lg">{t('convert.title')}</CardTitle>
            <CardDescription>{t('convert.ctaHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConvertWonForm
              opportunityId={detail.id}
              defaultProjectName={detail.name}
              acceptedVersionId={acceptedVersionId}
              netAmount={acceptedVersion?.subtotalAmount ?? null}
              taxAmount={acceptedVersion?.taxAmount ?? null}
              totalAmount={acceptedVersion?.totalAmount ?? null}
              currency={acceptedVersion?.currency ?? currency}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('followUp.title')}</CardTitle>
          <CardDescription>{t('followUp.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canManage && detail.status === 'open' ? (
            <OpportunityFollowUpForm
              opportunityId={detail.id}
              notes={detail.opportunityNotes}
              expectedStartDate={detail.expectedStartDate}
              nextActionAt={detail.nextActionAt}
              nextActionText={detail.nextActionText}
            />
          ) : detail.opportunityNotes ||
            detail.expectedStartDate ||
            detail.nextActionAt ||
            detail.nextActionText ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--pf-text-muted)]">{t('followUp.nextActionLabel')}</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {detail.nextActionText?.trim() ? detail.nextActionText : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-muted)]">{t('followUp.nextActionAtLabel')}</dt>
                <dd className="mt-1">
                  {detail.nextActionAt ? (
                    <span
                      className={
                        nextActionUrgency(detail.nextActionAt) === 'overdue'
                          ? 'text-[var(--pf-status-danger-fg)]'
                          : undefined
                      }
                    >
                      {nextActionUrgency(detail.nextActionAt) === 'overdue'
                        ? `${t('followUp.overdue')}: `
                        : `${t('followUp.due')}: `}
                      {formatInstant(detail.nextActionAt, locale, timezone)}
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-muted)]">{t('followUp.notesLabel')}</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {detail.opportunityNotes?.trim() ? detail.opportunityNotes : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-muted)]">{t('followUp.expectedStartLabel')}</dt>
                <dd className="mt-1">
                  {detail.expectedStartDate && isBusinessDate(detail.expectedStartDate)
                    ? formatBusinessDate(detail.expectedStartDate, locale)
                    : '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('followUp.empty')}</p>
          )}
        </CardContent>
      </Card>

      {detail.leadId || detail.prospect ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('opportunity.pipelineLinks')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            {detail.leadId ? (
              <Link href={`/crm/leads/${detail.leadId}`} className={textNavLinkClassName}>
                {t('opportunity.openLead')}
              </Link>
            ) : null}
            {detail.prospect ? (
              <Link href={`/crm/prospects/${detail.prospect.id}`} className={textNavLinkClassName}>
                {t('opportunity.openProspect', { name: detail.prospect.name })}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {detail.convertedProjectId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('opportunity.converted')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap gap-3">
              <Link href={`/projects/${detail.convertedProjectId}`} className={textNavLinkClassName}>
                {t('opportunity.openProject')}
              </Link>
              {detail.convertedClientId ? (
                <Link href={`/clients/${detail.convertedClientId}`} className={textNavLinkClassName}>
                  {t('opportunity.openClient')}
                </Link>
              ) : null}
            </div>
            {detail.convertedContractId ? (
              <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                {t('opportunity.contractLinked', { id: detail.convertedContractId })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <EntityCustomFieldsPanel
        entityId={detail.id}
        fields={customFields}
        revalidatePath={`/crm/opportunities/${detail.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('history.title')}</CardTitle>
          <CardDescription>{t('history.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t('history.notesHeading')}</h3>
            {detail.notes.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.notesEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                  >
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {formatInstant(note.createdAt, locale, timezone)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? <OpportunityNoteForm opportunityId={detail.id} /> : null}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t('history.auditHeading')}</h3>
            {detail.auditEvents.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.auditEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.auditEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                  >
                    <p className="font-medium">{translateAuditAction(tAudit, event.action)}</p>
                    <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                      {formatInstant(event.createdAt, locale, timezone)}
                      {event.actorDisplayName || event.actorEmail
                        ? ` · ${event.actorDisplayName ?? event.actorEmail}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('opportunity.estimatesSection')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.estimates.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {detail.estimates.map((estimate) => (
                <li key={estimate.id} className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-start">{estimate.name}</span>
                  <span className="shrink-0 text-[var(--pf-text-secondary)]" dir={estimate.internalAmount ? 'ltr' : undefined}>
                    {estimate.internalAmount
                      ? `${estimate.internalAmount} ${estimate.currency}`
                      : t(`statuses.estimate.${estimate.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canManage && detail.status === 'open' ? (
            <OpportunityEstimateForm opportunityId={detail.id} currency={currency} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('opportunity.quotesSection')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.salesQuotes.map((quote) => (
            <div key={quote.id} className="rounded-md border border-[var(--pf-border-default)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-start font-medium">{quote.title}</p>
                <StatusBadge
                  className="shrink-0"
                  shape={quote.status === 'accepted' ? 'active' : 'archived'}
                  label={t(`statuses.quote.${quote.status}`)}
                />
              </div>
              <ul className="flex flex-col gap-2">
                {quote.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-start">
                      {t('opportunity.versionLabel', { number: version.versionNumber })} ·{' '}
                      <span dir="ltr">
                        {t('opportunity.quoteNet')}: {version.subtotalAmount} {version.currency}
                        {version.taxAmount && version.taxAmount !== '0'
                          ? ` · ${t('opportunity.quoteTax')}: ${version.taxAmount}`
                          : ''}{' '}
                        · {t('opportunity.quoteTotal')}: {version.totalAmount} {version.currency}
                      </span>{' '}
                      · {t(`statuses.version.${version.status}`)}
                    </span>
                    {canManage && detail.status === 'open' ? (
                      <div className="flex flex-wrap gap-2">
                        {version.status === 'draft' ? (
                          <IssueVersionButton versionId={version.id} />
                        ) : null}
                        {version.status === 'draft' || version.status === 'issued' ? (
                          <AcceptVersionButton versionId={version.id} />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {canManage && detail.status === 'open' ? (
            <OpportunityQuoteForm opportunityId={detail.id} currency={currency} />
          ) : null}
        </CardContent>
      </Card>

      {canManage && detail.status === 'open' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('opportunity.markLost')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkLostForm opportunityId={detail.id} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
