import { isDeveloperGcMode } from '@/modules/project-profile/domain/management-mode';
import type { DeliveryProfile } from '@/modules/project-profile/domain/profile';
import type { ProjectCapability } from '@/modules/project-team/domain/capabilities';
import { resolveDailyLogHref } from './daily-log-target';
import { selectExecutionHubChildren, type ExecutionHubChildLink } from './execution-hubs';

/** Quality-hub tools available on non–developer/GC projects (EXL-A9 / D1). */
export const NON_GC_QUALITY_TOOL_CHILD_IDS = [
  'quality-plans',
  'quality-rfi',
  'quality-submittals',
  'quality-inspections',
  'quality-defects',
  'quality-log',
] as const;

const NON_GC_QUALITY_TOOL_ID_SET = new Set<string>(NON_GC_QUALITY_TOOL_CHILD_IDS);

export const FIELD_INSPECTIONS_TOOL_ID = 'field-inspections';

const OPERATIONAL_TOOL_DISPLAY_ORDER: readonly string[] = [
  ...NON_GC_QUALITY_TOOL_CHILD_IDS,
  FIELD_INSPECTIONS_TOOL_ID,
];

export interface ProjectOperationalToolLink {
  readonly id: string;
  readonly labelKey: string;
  readonly href: string;
}

export interface ProjectOperationalToolInput {
  readonly projectId: string;
  readonly capabilities: ReadonlySet<ProjectCapability>;
  readonly deliveryProfile: Pick<DeliveryProfile, 'operatingRoles'> | null;
  readonly modules: { readonly field_ops?: boolean };
  readonly surfaceRoot?: string;
}

function sortOperationalTools(links: ProjectOperationalToolLink[]): ProjectOperationalToolLink[] {
  const order = new Map(OPERATIONAL_TOOL_DISPLAY_ORDER.map((id, index) => [id, index]));
  return [...links].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

function dailyLogHrefForSurface(
  input: ProjectOperationalToolInput,
  surfaceRoot: string,
): string | null {
  const href = resolveDailyLogHref({
    deliveryProfile: input.deliveryProfile,
    modules: input.modules,
    projectId: input.projectId,
  });
  if (!href) return null;
  if (surfaceRoot.startsWith('/employee/') && href.includes('/site-log')) {
    return `${surfaceRoot}/site-log`;
  }
  return href;
}

function mapQualityChild(
  input: ProjectOperationalToolInput,
  child: ExecutionHubChildLink & { readonly href: string },
): ProjectOperationalToolLink | null {
  if (child.id === 'quality-log') {
    const root = input.surfaceRoot ?? `/projects/${input.projectId}`;
    const href = dailyLogHrefForSurface(input, root);
    if (!href) return null;
    return { id: child.id, labelKey: 'dailyLog', href };
  }

  const labelKey = child.id === 'quality-inspections' ? 'projectInspections' : child.labelKey;
  return { id: child.id, labelKey, href: child.href };
}

/**
 * Direct quality / site tool links for projects that are not explicit developer + GC.
 * Does not surface hub routes (execution-quality, cost-control, contractor-payments, …).
 */
export function selectProjectOperationalToolLinks(
  input: ProjectOperationalToolInput,
): ProjectOperationalToolLink[] {
  if (isDeveloperGcMode(input.deliveryProfile)) return [];

  const children = selectExecutionHubChildren({
    hub: 'quality',
    projectId: input.projectId,
    capabilities: input.capabilities,
    surfaceRoot: input.surfaceRoot,
  }).filter((child) => NON_GC_QUALITY_TOOL_ID_SET.has(child.id));

  const links: ProjectOperationalToolLink[] = [];
  for (const child of children) {
    const mapped = mapQualityChild(input, child);
    if (mapped) links.push(mapped);
  }

  const hasProjectInspections = links.some((link) => link.id === 'quality-inspections');
  if (hasProjectInspections && input.modules.field_ops) {
    links.push({
      id: FIELD_INSPECTIONS_TOOL_ID,
      labelKey: 'fieldInspections',
      href: `/field-ops/inspections?projectId=${input.projectId}`,
    });
  }

  return sortOperationalTools(links);
}
