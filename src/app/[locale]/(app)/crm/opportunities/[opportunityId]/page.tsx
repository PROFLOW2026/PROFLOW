import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { canConvertOpportunity, getOpportunityById } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
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
  try {
    const result = await withOrgContext(async (context) => ({
      detail: await getOpportunityById(context, opportunityId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
      defaultCurrency: context.organization.baseCurrency,
    }));
    detail = result.detail;
    canManage = result.canManage;
    defaultCurrency = result.defaultCurrency;
  } catch {
    notFound();
  }

  const currency = detail.currency ?? defaultCurrency;
  const acceptedVersionId =
    detail.salesQuotes
      .flatMap((quote) => quote.versions)
      .find((version) => version.status === 'accepted')?.id ?? null;
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

      {detail.convertedProjectId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('opportunity.converted')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href={`/projects/${detail.convertedProjectId}`} className="hover:underline">
              {t('opportunity.openProject')}
            </Link>
            {detail.convertedClientId ? (
              <Link href={`/clients/${detail.convertedClientId}`} className="hover:underline">
                {t('opportunity.openClient')}
              </Link>
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
            />
          </CardContent>
        </Card>
      ) : null}

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
                <li key={estimate.id} className="flex justify-between gap-2">
                  <span>{estimate.name}</span>
                  <span className="text-[var(--pf-text-secondary)]">
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
                <p className="font-medium">{quote.title}</p>
                <StatusBadge
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
                    <span>
                      {t('opportunity.versionLabel', { number: version.versionNumber })} ·{' '}
                      {version.totalAmount} {version.currency} ·{' '}
                      {t(`statuses.version.${version.status}`)}
                    </span>
                    {canManage && detail.status === 'open' ? (
                      <div className="flex gap-2">
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
