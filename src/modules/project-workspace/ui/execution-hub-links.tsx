import 'server-only';

import { getTranslations } from 'next-intl/server';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import {
  EXECUTION_HUBS,
  selectExecutionHubChildren,
  type ExecutionHubKey,
} from '@/modules/project-workspace/domain/execution-hubs';
import { Link } from '@/shared/i18n/navigation';
import { ExecutionHubFrame, groupHubChildren } from './execution-hub-frame';

const HUB_CAPABILITY = Object.fromEntries(EXECUTION_HUBS.map((hub) => [hub.key, hub.anyOf])) as Record<
  ExecutionHubKey,
  (typeof EXECUTION_HUBS)[number]['anyOf']
>;

type LinkHub = Extract<ExecutionHubKey, 'payments' | 'planning' | 'quality'>;

/** Payments, planning, and quality hubs. Child links only, no subcontract loaders. */
export async function ExecutionHubLinks({
  hub,
  surfaceRoot,
  params,
}: {
  readonly hub: LinkHub;
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

  const footer =
    hub === 'payments' && access.capabilities.has(PROJECT_CAPABILITIES.CLAIM_REVIEW) ? (
      <Link
        href={`${root}/claims?new=1`}
        className="inline-flex min-h-11 items-center self-start rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
      >
        {t('execution.hubLinks.newClaim')}
      </Link>
    ) : null;

  return (
    <ExecutionHubFrame hub={hub} root={root} groups={groupHubChildren(children)} footer={footer} />
  );
}
