import 'server-only';

import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { selectExecutionHubChildren } from '@/modules/project-workspace/domain/execution-hubs';
import { listProjectAgreementTitles } from '@/modules/subcontracts/application/agreement-titles';
import { listProjectPaymentStageLines } from '@/modules/subcontracts/application/payment-stage-lines';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { ExecutionHubFrame, groupHubChildren } from './execution-hub-frame';

/** Contracts hub only. Payment-stage lines and agreement titles stay off the other hubs. */
export async function ContractsExecutionHub({
  surfaceRoot,
  params,
}: {
  readonly surfaceRoot?: string;
  readonly params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await requireProjectCapabilityPage(
    projectId,
    [PROJECT_CAPABILITIES.CONTRACTOR_VIEW, PROJECT_CAPABILITIES.CONTRACT_FINANCIAL_VIEW, PROJECT_CAPABILITIES.CONTRACT_MANAGE],
    { mode: 'any' },
  );
  const t = await getTranslations('projectWorkspace');
  const root = surfaceRoot ?? `/projects/${projectId}`;
  const children = selectExecutionHubChildren({
    hub: 'contracts',
    projectId,
    capabilities: access.capabilities,
    surfaceRoot: root,
  });
  const { stages, titles } = await withOrgContext(async (context) => {
    const [stageRows, agreements] = await Promise.all([
      listProjectPaymentStageLines(context.db, context.organizationId, projectId),
      listProjectAgreementTitles(context.db, context.organizationId, projectId),
    ]);
    return {
      stages: stageRows,
      titles: new Map(agreements.map((agreement) => [agreement.id, agreement.title])),
    };
  });

  const footer = access.capabilities.has(PROJECT_CAPABILITIES.CONTRACT_MANAGE) ? (
    <Link
      href={`${root}/contractors?new=1`}
      className="inline-flex min-h-11 items-center self-start rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
    >
      {t('execution.hubLinks.newAgreement')}
    </Link>
  ) : null;

  return (
    <ExecutionHubFrame
      hub="contracts"
      root={root}
      groups={groupHubChildren(children)}
      footer={footer}
      stages={stages}
      titles={titles}
    />
  );
}
