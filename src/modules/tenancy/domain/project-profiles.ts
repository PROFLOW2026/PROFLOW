/**
 * Project experience profiles control presentation/defaults around the
 * existing project model — not a second project engine.
 */

export const PROJECT_EXPERIENCE_PROFILE_KEYS = [
  'simple',
  'full',
  'boq',
  'consulting',
  'service_installation',
  'small_job',
] as const;

export type ProjectExperienceProfileKey = (typeof PROJECT_EXPERIENCE_PROFILE_KEYS)[number];

export function isProjectExperienceProfileKey(
  value: string | null | undefined,
): value is ProjectExperienceProfileKey {
  return (
    typeof value === 'string' &&
    (PROJECT_EXPERIENCE_PROFILE_KEYS as readonly string[]).includes(value)
  );
}

export type ProjectTabCapability =
  | 'financials'
  | 'expenses'
  | 'changes'
  | 'boq'
  | 'billing'
  | 'budgets'
  | 'team'
  | 'schedule'
  | 'time'
  | 'documents'
  | 'usage'
  | 'work'
  | 'closeout'
  | 'warranty';

/** Tabs each project profile prefers when org modules + permissions allow. */
export const PROJECT_PROFILE_TAB_ALLOWLIST: Readonly<
  Record<ProjectExperienceProfileKey, ReadonlySet<ProjectTabCapability>>
> = {
  simple: new Set(['expenses', 'billing', 'team', 'documents']),
  small_job: new Set(['expenses', 'billing', 'documents', 'team']),
  consulting: new Set([
    'financials',
    'billing',
    'team',
    'time',
    'documents',
    'schedule',
    'work',
  ]),
  service_installation: new Set([
    'expenses',
    'billing',
    'team',
    'time',
    'documents',
    'usage',
    'schedule',
  ]),
  boq: new Set([
    'financials',
    'expenses',
    'changes',
    'boq',
    'billing',
    'budgets',
    'team',
    'schedule',
    'time',
    'documents',
    'usage',
    'work',
    'closeout',
    'warranty',
  ]),
  full: new Set([
    'financials',
    'expenses',
    'changes',
    'boq',
    'billing',
    'budgets',
    'team',
    'schedule',
    'time',
    'documents',
    'usage',
    'work',
    'closeout',
    'warranty',
  ]),
};

export interface DeriveProjectProfileInput {
  readonly stored: string | null | undefined;
  readonly workKind: 'project' | 'job' | 'work_order' | string;
  /** Org business profile key when known. */
  readonly businessProfileKey?: string | null;
  readonly boqModuleEnabled?: boolean;
}

/**
 * Explicit project setting wins. Otherwise derive a calm default from
 * work kind + org profile — never invents a second financial entity.
 */
export function resolveProjectExperienceProfile(
  input: DeriveProjectProfileInput,
): ProjectExperienceProfileKey {
  if (isProjectExperienceProfileKey(input.stored)) return input.stored;

  if (input.workKind === 'job') return 'small_job';
  if (input.workKind === 'work_order') return 'service_installation';

  const profile = input.businessProfileKey ?? '';
  if (
    profile === 'ARCHITECT' ||
    profile === 'DESIGNER' ||
    profile === 'ENGINEERING_CONSULTANT' ||
    profile === 'PROJECT_MANAGEMENT'
  ) {
    return 'consulting';
  }
  if (profile === 'SMALL_WORKS') return 'simple';
  if (input.boqModuleEnabled || profile === 'GENERAL_CONTRACTOR') return 'boq';
  return 'full';
}

export function projectProfileAllowsTab(
  profile: ProjectExperienceProfileKey,
  tab: ProjectTabCapability,
): boolean {
  return PROJECT_PROFILE_TAB_ALLOWLIST[profile].has(tab);
}
