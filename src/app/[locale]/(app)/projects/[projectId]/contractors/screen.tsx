import { HardHat } from 'lucide-react';
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
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import { getLocale } from 'next-intl/server';

export async function ProjectContractorsScreen({ surfaceRoot,
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
    <WithClientMessages extra={['projectWorkspace', 'subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('contractors.pageTitle')} description={t('contractors.pageDescription')} />

        {createOptions ? (
          <CreateAgreementForm
            projectId={projectId}
            vendors={createOptions.vendors}
            workPackages={createOptions.workPackages}
          />
        ) : null}

        {data.items.length === 0 ? (
          <EmptyState icon={HardHat} title={t('contractors.emptyTitle')} description={t('contractors.emptyDescription')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.agreement.id}>
                <Card className="transition-colors hover:bg-[var(--pf-surface-hover)]">
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={item.detailHref} className="min-w-0 flex-1 rounded-md focus-visible:outline focus-visible:outline-2">
                        <p className="font-semibold text-[var(--pf-text-primary)]">{item.agreement.title}</p>
                        <p className="text-sm text-[var(--pf-text-secondary)]">
                          {item.agreement.vendorName ?? t('contractors.unknownVendor')}
                          {item.agreement.trade ? ` · ${item.agreement.trade}` : ''}
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <Link
                        href={`${item.detailHref}/lines`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]"
                      >
                        {tSub('nav.lines')}
                      </Link>
                      <Link
                        href={`${item.detailHref}/changes`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]"
                      >
                        {tSub('nav.changes')}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

export default function ProjectContractorsPage(
  props: Omit<Parameters<typeof ProjectContractorsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectContractorsScreen {...props} />;
}
