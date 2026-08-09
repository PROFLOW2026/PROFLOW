import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { canConvertOpportunity, getOpportunityById } from '@/modules/crm';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { upsertEntityFieldValueAction } from '../../../settings/custom-fields/actions';
import {
  AcceptVersionButton,
  ConvertWonForm,
  IssueVersionButton,
  MarkLostForm,
  OpportunityEstimateForm,
  OpportunityNoteForm,
  OpportunityQuoteForm,
} from './opportunity-actions';

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

  let detail;
  let canManage = false;
  let defaultCurrency = 'ILS';
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  try {
    const result = await withOrgContext(async (context) => ({
      detail: await getOpportunityById(context, opportunityId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
      defaultCurrency: context.organization.baseCurrency,
      customFields: await listCustomFieldValuesForEntity(context, 'opportunity', opportunityId).catch(
        () => [],
      ),
    }));
    detail = result.detail;
    canManage = result.canManage;
    defaultCurrency = result.defaultCurrency;
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
          <Link href="/crm" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />

      {detail.leadId || detail.prospect ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('opportunity.pipelineLinks')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            {detail.leadId ? (
              <Link href={`/crm/leads/${detail.leadId}`} className="hover:underline">
                {t('opportunity.openLead')}
              </Link>
            ) : null}
            {detail.prospect ? (
              <Link href={`/crm/prospects/${detail.prospect.id}`} className="hover:underline">
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
              <Link href={`/projects/${detail.convertedProjectId}`} className="hover:underline">
                {t('opportunity.openProject')}
              </Link>
              {detail.convertedClientId ? (
                <Link href={`/clients/${detail.convertedClientId}`} className="hover:underline">
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

      {canManage && convertible ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('convert.title')}</CardTitle>
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

      <EntityCustomFieldsPanel
        entityId={detail.id}
        fields={customFields}
        revalidatePath={`/crm/opportunities/${detail.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('opportunity.notesSection')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.notes.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                >
                  {note.body}
                </li>
              ))}
            </ul>
          )}
          {canManage ? <OpportunityNoteForm opportunityId={detail.id} /> : null}
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
