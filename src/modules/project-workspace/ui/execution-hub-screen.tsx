import 'server-only';

import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { listProjectPaymentStageLines } from '@/modules/subcontracts/application/payment-stage-lines';
import { loadProjectContractorList } from '@/modules/project-workspace/application/load-project-contractors';
import {
  EXECUTION_HUBS,
  selectExecutionHubChildren,
  type ExecutionHubKey,
} from '@/modules/project-workspace/domain/execution-hubs';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

const HUB_CAPABILITY = Object.fromEntries(EXECUTION_HUBS.map((hub) => [hub.key, hub.anyOf])) as Record<
  ExecutionHubKey,
  (typeof EXECUTION_HUBS)[number]['anyOf']
>;

export async function ExecutionHubScreen({
  hub,
  surfaceRoot,
  params,
}: {
  readonly hub: Exclude<ExecutionHubKey, 'overview' | 'contractors' | 'team'>;
  readonly surfaceRoot?: string;
  readonly params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await requireProjectCapabilityPage(projectId, HUB_CAPABILITY[hub], { mode: 'any' });
  const t = await getTranslations('projectWorkspace');
  const root = surfaceRoot ?? `/projects/${projectId}`;
  const children = selectExecutionHubChildren({
    hub,
    projectId,
    capabilities: access.capabilities,
    surfaceRoot: root,
  });
  const groups = new Map<string, typeof children>();
  for (const child of children) {
    const bucket = groups.get(child.groupKey);
    if (bucket) bucket.push(child);
    else groups.set(child.groupKey, [child]);
  }

  const stages =
    hub === 'contracts'
      ? await withOrgContext((context) =>
          listProjectPaymentStageLines(context.db, context.organizationId, projectId),
        )
      : [];
  const contractors =
    hub === 'contracts'
      ? await withOrgContext((context) => loadProjectContractorList(context, projectId, { surfaceRoot: root }))
      : null;
  const titles = new Map(contractors?.items.map((item) => [item.agreement.id, item.agreement.title]) ?? []);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t(`execution.hubs.${hub}` as never)} description={t(`execution.hubDescriptions.${hub}` as never)} />

      {hub === 'payments' ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.financialHint')}</p>
      ) : null}

      {hub === 'planning' ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.planningHint')}</p>
      ) : null}

      {[...groups.entries()].map(([groupKey, links]) => (
        <section key={groupKey} className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">
            {t(`execution.hubGroups.${groupKey}` as never)}
          </h2>
          <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {links.map((link) => (
              <li key={link.id} className="min-w-0">
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--pf-text-primary)] hover:bg-[var(--pf-action-subtle-hover)]"
                >
                  {t(`execution.hubLinks.${link.labelKey}` as never)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {hub === 'contracts' && access.capabilities.has(PROJECT_CAPABILITIES.CONTRACT_MANAGE) ? (
        <Link
          href={`${root}/contractors?new=1`}
          className="inline-flex min-h-11 items-center self-start rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
        >
          {t('execution.hubLinks.newAgreement')}
        </Link>
      ) : null}

      {hub === 'payments' && access.capabilities.has(PROJECT_CAPABILITIES.CLAIM_REVIEW) ? (
        <Link
          href={`${root}/claims?new=1`}
          className="inline-flex min-h-11 items-center self-start rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
        >
          {t('execution.hubLinks.newClaim')}
        </Link>
      ) : null}

      {hub === 'contracts' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('execution.paymentStages.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.paymentStages.hint')}</p>
            {stages.length === 0 ? (
              <EmptyState size="sm" title={t('execution.paymentStages.emptyTitle')} description={t('execution.paymentStages.emptyDescription')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {stages.map((stage) => (
                  <li key={stage.id} className="min-w-0 rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <Link href={`${root}/contractors/${stage.agreementId}/lines`} className="font-medium break-words">
                      {stage.code ? `${stage.code} · ` : ''}
                      {stage.description}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {titles.get(stage.agreementId) ?? t('contractors.unknownVendor')}
                      {' · '}
                      {t(`execution.paymentStages.types.${stage.lineType}` as never)}
                      {stage.weightPercent ? ` · ${t('execution.paymentStages.weight', { weight: stage.weightPercent })}` : ''}
                      {stage.plannedStart ? ` · ${stage.plannedStart}` : ''}
                      {stage.plannedEnd ? ` – ${stage.plannedEnd}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
