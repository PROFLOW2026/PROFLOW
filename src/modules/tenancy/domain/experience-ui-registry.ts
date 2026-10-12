/**
 * Org-level UI visibility toggles (presentation only — never RBAC or routes).
 */

import type { ExperienceDashboardCard } from './experience-dashboard';
import type { CapabilityCustomizationMode } from './capability-overrides';
import type { ExperienceFamilyKey } from './experience-family';
import type { ExperienceUiOverrides } from './experience-family';
import type { ProjectTabKey } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';

export const EXPERIENCE_UI_TOGGLE_GROUPS = [
  'dashboardOwner',
  'dashboardCard',
  'dashboardCommon',
  'navPrimary',
  'projectTab',
  'shortcuts',
] as const;

export type ExperienceUiToggleGroup = (typeof EXPERIENCE_UI_TOGGLE_GROUPS)[number];

export type ExperienceUiToggleId =
  | `owner.${string}`
  | `card.${ExperienceDashboardCard}`
  | `common.${string}`
  | `nav.${string}`
  | `projectTab.${ProjectTabKey}`
  | `shortcuts.${string}`;

export interface ExperienceUiToggleDefinition {
  readonly id: ExperienceUiToggleId;
  readonly group: ExperienceUiToggleGroup;
  /** When true, UI may not turn off (tooltip lockedReason). */
  readonly lockedForFamilies?: readonly ExperienceFamilyKey[];
}

export const EXPERIENCE_UI_TOGGLES: readonly ExperienceUiToggleDefinition[] = [
  { id: 'common.pendingTime', group: 'dashboardCommon' },
  { id: 'common.laborReconciliation', group: 'dashboardCommon' },
  { id: 'common.attention', group: 'dashboardCommon' },
  { id: 'shortcuts.dashboardQuickAccess', group: 'shortcuts' },
  { id: 'owner.contractSummary', group: 'dashboardOwner' },
  { id: 'owner.kpiRow', group: 'dashboardOwner' },
  { id: 'owner.cashForecast90', group: 'dashboardOwner', lockedForFamilies: ['project_contracting', 'real_estate_development'] },
  { id: 'owner.apOutstanding', group: 'dashboardOwner' },
  { id: 'owner.restoredSections', group: 'dashboardOwner' },
  { id: 'owner.recentProjects', group: 'dashboardOwner' },
  { id: 'owner.projectProfitTable', group: 'dashboardOwner', lockedForFamilies: ['project_contracting'] },
  { id: 'owner.quickActions', group: 'dashboardOwner' },
  { id: 'owner.reportsLinks', group: 'dashboardOwner' },
  { id: 'card.activeWork', group: 'dashboardCard' },
  { id: 'card.contractValue', group: 'dashboardCard' },
  { id: 'card.profit', group: 'dashboardCard' },
  { id: 'card.forecast', group: 'dashboardCard' },
  { id: 'card.commitments', group: 'dashboardCard' },
  { id: 'card.billing', group: 'dashboardCard' },
  { id: 'card.collections', group: 'dashboardCard' },
  { id: 'card.serviceToday', group: 'dashboardCard' },
  { id: 'card.timeUtilization', group: 'dashboardCard' },
  { id: 'card.quotePipeline', group: 'dashboardCard' },
  { id: 'card.firstActions', group: 'dashboardCard' },
  { id: 'nav.today', group: 'navPrimary' },
  { id: 'nav.projects', group: 'navPrimary' },
  { id: 'nav.jobs', group: 'navPrimary' },
  { id: 'nav.workOrders', group: 'navPrimary' },
  { id: 'nav.clients', group: 'navPrimary' },
  { id: 'nav.expenses', group: 'navPrimary' },
  { id: 'nav.quotes', group: 'navPrimary' },
  { id: 'nav.procurement', group: 'navPrimary' },
  { id: 'nav.cashFlow', group: 'navPrimary' },
  { id: 'nav.crm', group: 'navPrimary' },
  { id: 'nav.vendorBills', group: 'navPrimary' },
  { id: 'nav.portfolio', group: 'navPrimary' },
  { id: 'nav.myWork', group: 'navPrimary' },
  { id: 'nav.fieldHome', group: 'navPrimary' },
  { id: 'nav.fieldOps', group: 'navPrimary' },
  { id: 'projectTab.financials', group: 'projectTab' },
  { id: 'projectTab.expenses', group: 'projectTab' },
  { id: 'projectTab.changes', group: 'projectTab' },
  { id: 'projectTab.boq', group: 'projectTab' },
  { id: 'projectTab.billing', group: 'projectTab' },
  { id: 'projectTab.billingPlan', group: 'projectTab' },
  { id: 'projectTab.budgets', group: 'projectTab' },
  { id: 'projectTab.team', group: 'projectTab' },
  { id: 'projectTab.schedule', group: 'projectTab' },
  { id: 'projectTab.time', group: 'projectTab' },
  { id: 'projectTab.documents', group: 'projectTab' },
  { id: 'projectTab.usage', group: 'projectTab' },
  { id: 'projectTab.work', group: 'projectTab' },
  { id: 'projectTab.closeout', group: 'projectTab' },
  { id: 'projectTab.warranty', group: 'projectTab' },
] as const;

const TOGGLE_BY_ID = new Map(EXPERIENCE_UI_TOGGLES.map((t) => [t.id, t]));

export function getExperienceUiToggle(id: string): ExperienceUiToggleDefinition | undefined {
  return TOGGLE_BY_ID.get(id as ExperienceUiToggleId);
}

export interface ExperienceUiContext {
  readonly customizationMode: CapabilityCustomizationMode | null;
  readonly family: ExperienceFamilyKey;
  readonly overrides: ExperienceUiOverrides;
}

export function isExperienceUiCustomizationActive(ctx: ExperienceUiContext): boolean {
  return ctx.customizationMode === 'custom';
}

/** Default visible: all on for `all` / all_capabilities family; else all on until user toggles custom. */
export function defaultToggleVisible(_id: ExperienceUiToggleId, ctx: ExperienceUiContext): boolean {
  if (ctx.customizationMode === 'all' || ctx.family === 'all_capabilities') return true;
  return true;
}

export function isToggleLocked(
  id: ExperienceUiToggleId,
  ctx: ExperienceUiContext,
): boolean {
  const def = getExperienceUiToggle(id);
  if (!def?.lockedForFamilies?.length) return false;
  return def.lockedForFamilies.includes(ctx.family);
}

/**
 * Visible when not in custom mode, or override not explicitly false.
 * `dataPresent === false` blocks hide (tab/content guard).
 */
export function isExperienceUiVisible(
  id: ExperienceUiToggleId,
  ctx: ExperienceUiContext,
  options?: { dataPresent?: boolean },
): boolean {
  if (!isExperienceUiCustomizationActive(ctx)) return defaultToggleVisible(id, ctx);
  if (isToggleLocked(id, ctx)) return true;

  const override = ctx.overrides[id];
  if (override !== false) return defaultToggleVisible(id, ctx);

  if (options !== undefined) {
    if (options.dataPresent === true) return true;
    if (options.dataPresent === undefined) return true;
    return false;
  }
  return false;
}

export function buildExperienceUiContext(input: {
  readonly customizationMode: CapabilityCustomizationMode | null;
  readonly family: ExperienceFamilyKey;
  readonly overrides: ExperienceUiOverrides;
}): ExperienceUiContext {
  return {
    customizationMode: input.customizationMode,
    family: input.family,
    overrides: input.overrides,
  };
}

export function experienceToggleI18nKey(id: string): string {
  return id.replace(/\./g, '_');
}

export function filterDashboardCards(
  cards: readonly ExperienceDashboardCard[],
  ctx: ExperienceUiContext,
): ExperienceDashboardCard[] {
  return cards.filter((card) => isExperienceUiVisible(`card.${card}` as ExperienceUiToggleId, ctx));
}

export function navDemoteKeysFromOverrides(ctx: ExperienceUiContext): ReadonlySet<string> {
  if (!isExperienceUiCustomizationActive(ctx)) return new Set();
  const demote = new Set<string>();
  for (const def of EXPERIENCE_UI_TOGGLES) {
    if (def.group !== 'navPrimary') continue;
    const navKey = def.id.replace(/^nav\./, '');
    if (!isExperienceUiVisible(def.id, ctx)) demote.add(navKey);
  }
  return demote;
}

export function parseOverridesFormData(formData: FormData): ExperienceUiOverrides {
  const raw = formData.get('overridesJson');
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const def of EXPERIENCE_UI_TOGGLES) {
      const v = parsed[def.id];
      if (typeof v === 'boolean') out[def.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeExperienceUiOverrides(
  previous: ExperienceUiOverrides,
  next: ExperienceUiOverrides,
): ExperienceUiOverrides {
  return { ...previous, ...next };
}
