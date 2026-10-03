import { PROJECT_CAPABILITIES, type ProjectCapability } from '@/modules/project-team/domain/capabilities';
import type { QuickCreateAction } from './quick-create';

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Project id segment from an app path, with or without a locale prefix. */
export function projectIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/(?:^|\/)projects\/([^/?#]+)/);
  const id = match?.[1];
  if (!id || !PROJECT_ID_PATTERN.test(id)) return null;
  return id;
}

export function isProjectQuickCreateId(projectId: string): boolean {
  return PROJECT_ID_PATTERN.test(projectId);
}

interface ProjectQuickCreateSpec {
  readonly key: string;
  readonly labelKey: string;
  /** Shown when the viewer holds any one of these (already expanded by the server). */
  readonly anyOf: readonly ProjectCapability[];
  /** Path under the project root, including the leading slash and query. */
  readonly path: string;
}

/** Owner project root. Employee sessions pass `/employee/projects/${id}` explicitly. */
export function resolveProjectQuickCreateRoot(projectId: string, root?: string | null): string {
  const owner = `/projects/${projectId}`;
  const employee = `/employee/projects/${projectId}`;
  return root === employee ? employee : owner;
}

const C = PROJECT_CAPABILITIES;

/**
 * Create entries that already exist on project pages.
 * Destinations assert the same capability server-side; this list only hides the menu item.
 */
const PROJECT_QUICK_CREATE_SPECS: readonly ProjectQuickCreateSpec[] = [
  {
    key: 'contractorContract',
    labelKey: 'contractorContract',
    anyOf: [C.CONTRACT_MANAGE],
    path: '/contractors?new=1',
  },
  {
    key: 'projectTask',
    labelKey: 'projectTask',
    anyOf: [C.TASKS_MANAGE],
    path: '/tasks?new=1',
  },
  {
    key: 'coordinationEvent',
    labelKey: 'coordinationEvent',
    anyOf: [C.SCHEDULE_MANAGE, C.CONTRACTOR_COORDINATE],
    path: '/coordination?new=1',
  },
  {
    key: 'rfi',
    labelKey: 'rfi',
    anyOf: [C.RFI_MANAGE],
    path: '/rfi?new=1',
  },
  {
    key: 'submittal',
    labelKey: 'submittal',
    anyOf: [C.SUBMITTAL_MANAGE],
    path: '/submittals?new=1',
  },
  {
    key: 'defect',
    labelKey: 'defect',
    anyOf: [C.DEFECTS_MANAGE, C.QUALITY_MANAGE],
    path: '/defects?new=1',
  },
  {
    key: 'inspection',
    labelKey: 'inspection',
    anyOf: [C.QUALITY_MANAGE],
    path: '/inspections?new=1',
  },
  {
    key: 'siteInstruction',
    labelKey: 'siteInstruction',
    anyOf: [C.CONTRACTOR_COORDINATE],
    path: '/instructions?create=1',
  },
  {
    key: 'claim',
    labelKey: 'claim',
    anyOf: [C.CLAIM_REVIEW],
    path: '/claims?new=1',
  },
];

/**
 * Project-scoped Quick Create items. Omitted entirely when the viewer lacks the
 * capability the destination already asserts. Every href carries `projectId`.
 */
export function buildProjectQuickCreateActions(
  projectId: string,
  held: ReadonlySet<string>,
  root?: string | null,
): QuickCreateAction[] {
  if (!isProjectQuickCreateId(projectId)) return [];
  const base = resolveProjectQuickCreateRoot(projectId, root);
  return PROJECT_QUICK_CREATE_SPECS.filter((spec) => spec.anyOf.some((capability) => held.has(capability))).map(
    (spec) => ({
      key: spec.key,
      labelKey: spec.labelKey,
      href: `${base}${spec.path}`,
    }),
  );
}
