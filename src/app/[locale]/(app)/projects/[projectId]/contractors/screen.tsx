import { HardHat, KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { loadProjectContractorList } from '@/modules/project-workspace/application/load-project-contractors';
import { getCreateAgreementOptions } from '@/modules/subcontracts';
import { CreateAgreementForm } from '@/modules/subcontracts/ui/forms';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import { getLocale } from 'next-intl/server';

export async function ProjectContractorsScreen({
  surfaceRoot,
  params,
  searchParams,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  const [t, tSub, locale, data, createOptions] = await Promise.all([
    getTranslations('projectWorkspace'),
    getTranslations('subcontracts'),
    getLocale(),
    withOrgContext((context) => loadProjectContractorList(context, projectId, { surfaceRoot })),
    query.new === '1'
      ? withOrgContext(async (context) => {
          try {
            return await getCreateAgreementOptions(context, projectId);
          } catch (error) {
            if (error instanceof AuthorizationError) return null;
            throw error;
          }
        })
      : Promise.resolve(null),
  ]);

  return (
    <WithAppClientMessages extra={['projectWorkspace', 'subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('contractors.pageTitle')}
          description={t('contractors.pageDescription')}
        />

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-subtle)] bg-[var(--pf-surface-muted)] p-4 text-sm text-[var(--pf-text-secondary)]">
          <p>{t('contractors.createHint')}</p>
          {data.items.length > 0 ? (
            <p className="font-medium tabular-nums text-[var(--pf-text-primary)]">
              {t('contractors.countSummary', { count: data.items.length })}
            </p>
          ) : null}
          {data.canManagePortalAccess && data.contractorAccessHref ? (
            <Link
              href={data.contractorAccessHref}
              className="inline-flex min-h-11 w-fit items-center gap-2 font-medium text-[var(--pf-text-brand)]"
            >
              <KeyRound className="size-4 shrink-0" aria-hidden />
              {t('contractors.managePortalAccess')}
            </Link>
          ) : null}
        </div>

        {createOptions ? (
          <CreateAgreementForm
            projectId={projectId}
            vendors={createOptions.vendors}
            workPackages={createOptions.workPackages}
          />
        ) : null}

        {data.items.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title={t('contractors.emptyTitle')}
            description={t('contractors.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.agreement.id}>
                <Card className="transition-colors hover:bg-[var(--pf-surface-hover)]">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        href={item.detailHref}
                        className="min-w-0 flex-1 rounded-md focus-visible:outline focus-visible:outline-2"
                      >
                        <p className="text-base font-semibold text-[var(--pf-text-primary)]">
                          {item.agreement.vendorName ?? item.agreement.title}
                        </p>
                        <p className="text-sm text-[var(--pf-text-secondary)]">
                          {item.agreement.trade
                            ? item.agreement.trade
                            : item.agreement.title !== item.agreement.vendorName
                              ? item.agreement.title
                              : null}
                        </p>
                      </Link>
                      <AgreementStatusBadge
                        status={item.agreement.status}
                        label={tSub(`agreementStatus.${item.agreement.status}`)}
                      />
                    </div>

                    {data.canViewFinancial && item.committedAmount && item.currency ? (
                      <p className="text-sm text-[var(--pf-text-secondary)]">
                        {t('contractors.committed')}:{' '}
                        <span className="font-medium tabular-nums text-[var(--pf-text-primary)]">
                          {bidiIsolate(formatMoneyString(item.committedAmount, item.currency, locale))}
                        </span>
                      </p>
                    ) : null}

                    {item.portal ? (
                      <p className="text-sm text-[var(--pf-text-secondary)]">
                        {t('contractors.portalUsername')}:{' '}
                        <span className="font-medium text-[var(--pf-text-primary)]" dir="ltr">
                          {item.portal.username ?? t('contractors.portalUsernameMissing')}
                        </span>
                        {' · '}
                        {t('contractors.portalAccess')}:{' '}
                        <span className="font-medium text-[var(--pf-text-primary)]">
                          {item.portal.grantStatus === 'active' ||
                          item.portal.grantStatus === 'revoked' ||
                          item.portal.grantStatus === 'expired'
                            ? t(`contractors.portalStatus.${item.portal.grantStatus}`)
                            : item.portal.grantStatus}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--pf-text-muted)]">{t('contractors.portalNone')}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <Link
                        href={item.detailHref}
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pf-text-brand)]"
                      >
                        {t('contractors.open360')}
                      </Link>
                      {data.canManagePortalAccess && data.contractorAccessHref ? (
                        <Link
                          href={data.contractorAccessHref}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]"
                        >
                          {t('contractors.manageAccessForContractor')}
                        </Link>
                      ) : null}
                      <Link
                        href={`${item.detailHref}/lines`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]"
                      >
                        {tSub('nav.lines')}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectContractorsPage(
  props: Omit<Parameters<typeof ProjectContractorsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectContractorsScreen {...props} />;
}
