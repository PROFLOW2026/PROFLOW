import type { ExecutionNavLinkKey } from './execution-route-catalog';

export const EXECUTION_NAV_GROUP_IDS = [
  'overview',
  'execution',
  'contractors',
  'commercial',
  'quality',
  'closeout',
] as const;

export type ExecutionNavGroupId = (typeof EXECUTION_NAV_GROUP_IDS)[number];

const GROUP_KEYS: Readonly<Record<ExecutionNavGroupId, readonly ExecutionNavLinkKey[]>> = {
  overview: ['executionDashboard', 'structure', 'team'],
  execution: ['schedule', 'coordination', 'tasks', 'activity', 'siteLog', 'siteMeetings', 'instructions'],
  contractors: ['contractors', 'tenders', 'contractorAccess'],
  commercial: ['claims', 'unpricedWork', 'deductions', 'costControl'],
  quality: [
    'plans',
    'rfi',
    'submittals',
    'inspections',
    'defects',
    'contractorCompliance',
    'siteSafety',
    'deliveries',
  ],
  closeout: ['contractorCloseout', 'contractorWarranty'],
};

export function executionNavGroupId(key: ExecutionNavLinkKey): ExecutionNavGroupId {
  for (const id of EXECUTION_NAV_GROUP_IDS) {
    if (GROUP_KEYS[id].includes(key)) return id;
  }
  return 'execution';
}

export function groupExecutionNavLinks<T extends { readonly key: ExecutionNavLinkKey }>(
  links: readonly T[],
): Array<{ id: ExecutionNavGroupId; links: T[] }> {
  const buckets = new Map<ExecutionNavGroupId, T[]>();
  for (const link of links) {
    const id = executionNavGroupId(link.key);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(link);
    else buckets.set(id, [link]);
  }
  return EXECUTION_NAV_GROUP_IDS.flatMap((id) => {
    const grouped = buckets.get(id);
    return grouped && grouped.length > 0 ? [{ id, links: grouped }] : [];
  });
}
