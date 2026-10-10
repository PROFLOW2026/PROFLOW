import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import {
  holdsRequirement,
  type PortalCapabilityRequirement,
} from '@/modules/contractor-portal/domain/capability-requirement';

/**
 * Developer-side workflow surfaces embedded in the contractor org project shell.
 * Capability gates mirror the guest portal route table — no extra caps for registration.
 */
export interface DeveloperWorkflowTab {
  readonly key: 'tasks' | 'rfi' | 'plans' | 'documents';
  readonly segment: string;
  readonly labelKey: `connectedDeveloper.tabs.${DeveloperWorkflowTab['key']}`;
  readonly capability: PortalCapabilityRequirement;
}

export const DEVELOPER_WORKFLOW_TABS: readonly DeveloperWorkflowTab[] = [
  {
    key: 'tasks',
    segment: 'tasks',
    labelKey: 'connectedDeveloper.tabs.tasks',
    capability: { anyOf: [CAP.TASK_WORK, CAP.TASK_REPORT] },
  },
  {
    key: 'rfi',
    segment: 'rfi',
    labelKey: 'connectedDeveloper.tabs.rfi',
    capability: { anyOf: [CAP.RFI_VIEW, CAP.RFI_RAISE] },
  },
  {
    key: 'plans',
    segment: 'plans',
    labelKey: 'connectedDeveloper.tabs.plans',
    capability: CAP.PLAN_VIEW,
  },
  {
    key: 'documents',
    segment: 'documents',
    labelKey: 'connectedDeveloper.tabs.documents',
    capability: CAP.DOCUMENT_VIEW,
  },
] as const;

export function visibleDeveloperWorkflowTabs(
  capabilities: ReadonlySet<string>,
): readonly DeveloperWorkflowTab[] {
  return DEVELOPER_WORKFLOW_TABS.filter((tab) => holdsRequirement(capabilities, tab.capability));
}

export function developerWorkflowHref(contractorProjectId: string, segment: string): string {
  return `/projects/${contractorProjectId}/developer/${segment}`;
}

/** Guest portal deep link for the same developer project (separate auth surface). */
export function portalDeveloperProjectHref(developerProjectId: string, segment: string): string {
  return `/contractor/projects/${developerProjectId}/${segment}`;
}
