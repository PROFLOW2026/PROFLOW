import {
  isNewBuildCategory,
  isResidentialCategory,
  type ConstructionCharacteristics,
} from './characteristics';
import type { DeliveryProfile, OperatingRole } from './profile';

/**
 * Deterministic, rule-based recommendation engine (no AI, no randomness, no I/O).
 *
 * Input: the project's delivery profile + construction characteristics.
 * Output: an ordered list of recommendations with stable keys and machine-readable reasons,
 * so the UI can explain "why" and accepted/dismissed decisions survive re-evaluation.
 *
 * Accepting a recommendation may only create NON-financial records (work packages,
 * milestones, tasks). Nothing here ever produces a contract, commitment or payment.
 */

export const RULESET_VERSION = 'dg-2026.10.1';

export const RECOMMENDATION_KINDS = [
  'trade',
  'work_package',
  'milestone',
  'coordination_event',
  'inspection',
  'handover_requirement',
  'task_template',
] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export type RecommendationTarget = 'work_package' | 'project_milestone' | 'task';

/** What an accepted recommendation creates. Exhaustive and non-financial by construction. */
export const RECOMMENDATION_TARGET_BY_KIND: Readonly<Record<RecommendationKind, RecommendationTarget>> = {
  trade: 'work_package',
  work_package: 'work_package',
  milestone: 'project_milestone',
  coordination_event: 'task',
  inspection: 'task',
  handover_requirement: 'task',
  task_template: 'task',
};

export const REASON_CODES = [
  'construction_scope',
  'role_developer',
  'role_general_contractor',
  'role_project_management',
  'role_subcontractor',
  'category_residential',
  'category_commercial',
  'category_office',
  'category_industrial',
  'category_public',
  'category_infrastructure',
  'category_renovation',
  'category_urban_renewal',
  'floors_below',
  'deep_basement',
  'parking',
  'mid_rise',
  'high_rise',
  'multi_building',
  'residential_units',
  'commercial_units',
  'public_areas',
  'site_works',
  'method_cast_in_place',
  'method_precast',
  'method_tunnel_formwork',
  'method_steel_structure',
  'method_timber',
  'method_light_construction',
  'method_mixed',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface Recommendation {
  /** Stable identity, e.g. `trade:elevators`, `work_package:building:2`. */
  readonly key: string;
  readonly kind: RecommendationKind;
  /** i18n code: `projectProfile.recommendations.items.<kind>.<code>`. */
  readonly code: string;
  readonly params: Readonly<Record<string, number>>;
  readonly reasons: readonly ReasonCode[];
  readonly target: RecommendationTarget;
}

export interface RecommendationInput {
  readonly profile: Pick<DeliveryProfile, 'operatingRoles'>;
  readonly characteristics: ConstructionCharacteristics;
}

/** Limits per-building work packages so a 300-building estate does not flood the list. */
export const MAX_BUILDING_PACKAGES = 20;

interface Signals {
  readonly roles: ReadonlySet<OperatingRole>;
  readonly building: boolean;
  readonly newBuild: boolean;
  readonly renovation: boolean;
  readonly infrastructure: boolean;
  readonly below: boolean;
  readonly deepBasement: boolean;
  readonly parking: boolean;
  readonly floorsAbove: number;
  readonly midRise: boolean;
  readonly highRise: boolean;
  readonly buildings: number;
  readonly residential: boolean;
  readonly commercial: boolean;
  readonly publicAreas: boolean;
  readonly siteWorks: boolean;
  readonly concrete: boolean;
  readonly methodReason: ReasonCode | null;
  readonly categoryReason: ReasonCode | null;
}

function positive(value: number | null): boolean {
  return value !== null && value > 0;
}

function positiveDecimal(value: string | null): boolean {
  return value !== null && Number(value) > 0;
}

export function deriveSignals(input: RecommendationInput): Signals {
  const c = input.characteristics;
  const roles = new Set(input.profile.operatingRoles);
  const category = c.category;
  const infrastructure = category === 'infrastructure';
  const renovation = category === 'renovation' || category === 'urban_renewal';
  const floorsAbove = c.floorsAboveGround ?? 0;
  const below = positive(c.floorsBelowGround);
  const parking = positive(c.parkingLevels);
  const building =
    !infrastructure &&
    (category !== null || positive(c.buildingsCount) || floorsAbove > 0 || below || positive(c.residentialUnits) ||
      positive(c.commercialUnits));
  const newBuild = building && isNewBuildCategory(category);
  const residential = positive(c.residentialUnits) || (building && isResidentialCategory(category));
  const commercial =
    positive(c.commercialUnits) ||
    (building && (category === 'commercial' || category === 'office' || category === 'mixed_use'));
  const publicAreas = c.hasPublicAreas || positiveDecimal(c.commonAreaSqm);
  const siteWorks = positiveDecimal(c.siteAreaSqm) || publicAreas || infrastructure;
  const method = c.constructionMethod;
  const concrete =
    newBuild && (method === null || method === 'cast_in_place' || method === 'tunnel_formwork' || method === 'mixed');
  const methodReason: ReasonCode | null = method && method !== 'other' ? (`method_${method}` as ReasonCode) : null;
  const categoryReason: ReasonCode | null =
    category && category !== 'other' && category !== 'mixed_use'
      ? (`category_${category}` as ReasonCode)
      : category === 'mixed_use'
        ? 'category_commercial'
        : null;
  return {
    roles,
    building,
    newBuild,
    renovation,
    infrastructure,
    below,
    deepBasement: (c.floorsBelowGround ?? 0) >= 2,
    parking,
    floorsAbove,
    midRise: floorsAbove >= 4,
    highRise: floorsAbove >= 9,
    buildings: c.buildingsCount ?? 0,
    residential,
    commercial,
    publicAreas,
    siteWorks,
    concrete,
    methodReason,
    categoryReason,
  };
}

const KIND_ORDER = new Map(RECOMMENDATION_KINDS.map((kind, index) => [kind, index]));

/**
 * Evaluates every rule. Same input -> same output (order included).
 * Empty characteristics + standard profile -> no recommendations.
 */
export function recommend(input: RecommendationInput): Recommendation[] {
  const s = deriveSignals(input);
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  const add = (
    kind: RecommendationKind,
    code: string,
    reasons: readonly (ReasonCode | null | false)[],
    params: Record<string, number> = {},
  ) => {
    const suffix = Object.values(params).join(':');
    const key = suffix ? `${kind}:${code}:${suffix}` : `${kind}:${code}`;
    if (seen.has(key)) return;
    seen.add(key);
    const clean = reasons.filter((reason): reason is ReasonCode => Boolean(reason));
    out.push({
      key,
      kind,
      code,
      params,
      reasons: clean.length > 0 ? [...new Set(clean)] : ['construction_scope'],
      target: RECOMMENDATION_TARGET_BY_KIND[kind],
    });
  };

  const developer = s.roles.has('developer');
  const gc = s.roles.has('general_contractor');
  const pm = s.roles.has('project_management');
  const sub = s.roles.has('subcontractor');
  const elevators = s.building && (s.floorsAbove >= 3 || (s.parking && s.floorsAbove >= 1));
  const elevatorReasons: ReasonCode[] = s.floorsAbove >= 3 ? ['mid_rise'] : ['parking'];
  const fire = s.building && (s.midRise || s.parking || s.commercial || s.categoryReason === 'category_public' ||
    s.categoryReason === 'category_industrial');
  const fireReasons: (ReasonCode | null | false)[] = [
    s.highRise ? 'high_rise' : s.midRise && 'mid_rise',
    s.parking && 'parking',
    s.commercial && 'commercial_units',
    (s.categoryReason === 'category_public' || s.categoryReason === 'category_industrial') && s.categoryReason,
  ];
  const facade = s.building && (s.highRise || s.categoryReason === 'category_office' || s.categoryReason === 'category_commercial');
  const facadeReasons: (ReasonCode | null | false)[] = [s.highRise && 'high_rise', !s.highRise && s.categoryReason];
  const underground: (ReasonCode | false)[] = [s.below && 'floors_below', s.parking && 'parking'];
  const residentialReasons: (ReasonCode | null | false)[] = [
    'residential_units',
    s.categoryReason === 'category_residential' && 'category_residential',
  ];
  const buyerFacing = developer && s.residential;

  // ── Trades ────────────────────────────────────────────────────────────────
  if (s.renovation) add('trade', 'demolition', [s.categoryReason]);
  if (s.newBuild && (s.below || s.parking || s.siteWorks)) add('trade', 'earthworks', [...underground, s.siteWorks && 'site_works']);
  if (s.deepBasement) add('trade', 'shoring', ['deep_basement']);
  if (s.concrete) add('trade', 'concrete_frame', [s.methodReason]);
  if (s.newBuild && input.characteristics.constructionMethod === 'precast') add('trade', 'precast_erection', ['method_precast']);
  if (s.newBuild && input.characteristics.constructionMethod === 'steel_structure') {
    add('trade', 'steel_erection', ['method_steel_structure']);
  }
  if (s.newBuild && (input.characteristics.constructionMethod === 'timber' ||
    input.characteristics.constructionMethod === 'light_construction')) {
    add('trade', 'light_frame', [s.methodReason]);
  }
  if (s.building) add('trade', 'waterproofing', [s.below && 'floors_below']);
  if (s.building) add('trade', 'plumbing', []);
  if (s.building) add('trade', 'electrical', []);
  if (s.building && (s.commercial || s.midRise || s.categoryReason === 'category_office' ||
    s.categoryReason === 'category_public' || s.categoryReason === 'category_industrial')) {
    add('trade', 'hvac', [s.commercial && 'commercial_units', s.midRise && 'mid_rise', s.categoryReason]);
  }
  if (fire) add('trade', 'fire_protection', fireReasons);
  if (elevators) add('trade', 'elevators', elevatorReasons);
  if (s.building) add('trade', 'aluminium_windows', []);
  if (facade) add('trade', 'facade_cladding', facadeReasons);
  if (s.building) add('trade', 'plaster_drywall', []);
  if (s.building) add('trade', 'tiling', []);
  if (s.building) add('trade', 'painting', []);
  if (s.residential) add('trade', 'carpentry_kitchens', residentialReasons);
  if (s.residential) add('trade', 'gas', residentialReasons);
  if (s.building) add('trade', 'low_voltage', []);
  if (s.parking) add('trade', 'parking_systems', ['parking']);
  if (s.siteWorks && !s.infrastructure) add('trade', 'landscaping', [s.publicAreas ? 'public_areas' : 'site_works']);
  if (s.infrastructure) add('trade', 'roads_paving', ['category_infrastructure']);
  if (s.infrastructure || (s.siteWorks && s.buildings > 1)) {
    add('trade', 'utilities_infrastructure', [s.infrastructure ? 'category_infrastructure' : 'multi_building']);
  }

  // ── Work packages ─────────────────────────────────────────────────────────
  if (s.newBuild && (s.below || s.parking)) add('work_package', 'substructure', underground);
  if (s.newBuild && s.floorsAbove > 0) add('work_package', 'superstructure', [s.methodReason]);
  if (s.building) add('work_package', 'envelope', facade ? facadeReasons : []);
  if (s.building) add('work_package', 'mep_systems', []);
  if (s.building) add('work_package', 'interior_finishes', [s.residential && 'residential_units']);
  if (s.publicAreas) add('work_package', 'common_areas', ['public_areas']);
  if (s.siteWorks) add('work_package', 'site_development', [s.publicAreas ? 'public_areas' : 'site_works']);
  if (s.infrastructure) add('work_package', 'infrastructure_works', ['category_infrastructure']);
  if (s.buildings > 1) {
    for (let n = 1; n <= Math.min(s.buildings, MAX_BUILDING_PACKAGES); n += 1) {
      add('work_package', 'building', ['multi_building'], { n });
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────
  if (developer && (s.building || s.infrastructure)) add('milestone', 'building_permit', ['role_developer']);
  if ((developer || gc) && (s.building || s.infrastructure)) {
    add('milestone', 'construction_start_order', [developer && 'role_developer', gc && 'role_general_contractor']);
  }
  if (gc) add('milestone', 'site_mobilization', ['role_general_contractor']);
  if (s.newBuild && (s.below || s.parking)) add('milestone', 'excavation_complete', underground);
  if (s.newBuild) add('milestone', 'foundations_complete', []);
  if (s.newBuild && s.floorsAbove > 0) add('milestone', 'frame_complete', [s.methodReason]);
  if (s.building) add('milestone', 'envelope_closed', []);
  if (s.building) add('milestone', 'systems_rough_in', []);
  if (s.building) add('milestone', 'finishes_complete', []);
  if (s.newBuild) add('milestone', 'occupancy_form4', [s.residential && 'residential_units', s.commercial && 'commercial_units']);
  if (s.newBuild) add('milestone', 'completion_certificate', []);
  if (buyerFacing) add('milestone', 'buyers_handover', ['residential_units', 'role_developer']);
  if (s.building && !buyerFacing) add('milestone', 'project_handover', []);
  if (s.infrastructure) add('milestone', 'infrastructure_acceptance', ['category_infrastructure']);

  // ── Coordination events ───────────────────────────────────────────────────
  if (gc || pm || developer) {
    add('coordination_event', 'weekly_site_meeting', [
      gc && 'role_general_contractor',
      pm && 'role_project_management',
      developer && 'role_developer',
    ]);
  }
  if (s.concrete) add('coordination_event', 'pre_pour_meeting', [s.methodReason]);
  if (s.newBuild && (s.midRise || input.characteristics.constructionMethod === 'precast' ||
    input.characteristics.constructionMethod === 'steel_structure')) {
    add('coordination_event', 'crane_installation', [s.midRise && 'mid_rise', s.methodReason]);
  }
  if (s.building && (s.midRise || s.commercial)) {
    add('coordination_event', 'mep_coordination', [s.midRise && 'mid_rise', s.commercial && 'commercial_units']);
  }
  if (facade) add('coordination_event', 'facade_mockup_review', facadeReasons);
  if (elevators) add('coordination_event', 'elevator_installation', elevatorReasons);
  if (s.newBuild) add('coordination_event', 'utility_connections', []);
  if (buyerFacing) add('coordination_event', 'buyers_walkthrough', ['residential_units', 'role_developer']);

  // ── Inspections ───────────────────────────────────────────────────────────
  if (s.newBuild) add('inspection', 'foundations', []);
  if (s.concrete) add('inspection', 'rebar_pre_pour', [s.methodReason]);
  if (s.newBuild && input.characteristics.constructionMethod === 'precast') add('inspection', 'precast_connections', ['method_precast']);
  if (s.newBuild && input.characteristics.constructionMethod === 'steel_structure') {
    add('inspection', 'steel_welding', ['method_steel_structure']);
  }
  if (s.below) add('inspection', 'basement_waterproofing', ['floors_below']);
  if (s.building) add('inspection', 'roof_flood_test', []);
  if (s.building) add('inspection', 'wet_area_flood_test', [s.residential && 'residential_units']);
  if (s.building) add('inspection', 'plumbing_pressure_test', []);
  if (s.building) add('inspection', 'electrical_panel', []);
  if (s.building) add('inspection', 'ceiling_closure', []);
  if (s.building) add('inspection', 'aluminium_water_test', []);
  if (fire) add('inspection', 'fire_systems', fireReasons);
  if (s.residential) add('inspection', 'gas_system', residentialReasons);
  if (s.parking) add('inspection', 'parking_ventilation', ['parking']);
  if (elevators) add('inspection', 'elevator', elevatorReasons);
  if (s.residential) add('inspection', 'apartment_pre_delivery', residentialReasons);

  // ── Handover requirements ─────────────────────────────────────────────────
  if (s.building || s.infrastructure) add('handover_requirement', 'as_built_drawings', []);
  if (s.building) add('handover_requirement', 'om_manuals', []);
  if (s.building) add('handover_requirement', 'warranty_certificates', []);
  if (s.building) add('handover_requirement', 'electrical_certificate', []);
  if (fire) add('handover_requirement', 'fire_department_approval', fireReasons);
  if (elevators) add('handover_requirement', 'elevator_certificate', elevatorReasons);
  if (s.residential) add('handover_requirement', 'gas_certificate', residentialReasons);
  if (s.newBuild) add('handover_requirement', 'occupancy_form4', [s.residential && 'residential_units']);
  if (s.newBuild) add('handover_requirement', 'utility_approvals', []);
  if (buyerFacing) add('handover_requirement', 'buyer_handover_protocols', ['residential_units', 'role_developer']);
  if (s.publicAreas) add('handover_requirement', 'common_areas_handover', ['public_areas']);
  if (s.infrastructure) add('handover_requirement', 'authority_handover', ['category_infrastructure']);

  // ── Task templates ────────────────────────────────────────────────────────
  if (gc || (developer && s.building)) {
    add('task_template', 'appoint_safety_officer', [gc && 'role_general_contractor', developer && 'role_developer']);
  }
  if (gc) add('task_template', 'site_opening_notice', ['role_general_contractor']);
  if (gc && (s.building || s.infrastructure)) add('task_template', 'site_logistics_plan', ['role_general_contractor']);
  if (gc) add('task_template', 'quality_control_plan', ['role_general_contractor']);
  if (gc || developer) {
    add('task_template', 'collect_contractor_insurance', [gc && 'role_general_contractor', developer && 'role_developer']);
    add('task_template', 'subcontractor_tender_plan', [gc && 'role_general_contractor', developer && 'role_developer']);
  }
  if (buyerFacing) {
    add('task_template', 'buyers_changes_window', ['residential_units', 'role_developer']);
    add('task_template', 'buyers_specification', ['residential_units', 'role_developer']);
  }
  if (developer || pm) {
    add('task_template', 'monthly_progress_report', [developer && 'role_developer', pm && 'role_project_management']);
    add('task_template', 'design_coordination_review', [developer && 'role_developer', pm && 'role_project_management']);
  }
  if (sub) {
    add('task_template', 'subcontract_scope_review', ['role_subcontractor']);
    add('task_template', 'subcontractor_daily_report', ['role_subcontractor']);
  }

  return out
    .map((item, index) => ({ item, index }))
    .sort((a, b) => KIND_ORDER.get(a.item.kind)! - KIND_ORDER.get(b.item.kind)! || a.index - b.index)
    .map(({ item }) => item);
}

export type RecommendationStatus = 'open' | 'accepted' | 'dismissed';

export interface RecommendationDecisionRef {
  readonly recommendationKey: string;
  readonly decision: 'accepted' | 'dismissed';
  readonly createdEntityType: RecommendationTarget | null;
  readonly createdEntityId: string | null;
}

export interface RecommendationWithStatus extends Recommendation {
  readonly status: RecommendationStatus;
  readonly createdEntityType: RecommendationTarget | null;
  readonly createdEntityId: string | null;
}

/** Joins current recommendations with stored decisions (decisions for vanished keys are kept apart). */
export function applyDecisions(
  recommendations: readonly Recommendation[],
  decisions: readonly RecommendationDecisionRef[],
): { readonly items: RecommendationWithStatus[]; readonly orphanDecisions: RecommendationDecisionRef[] } {
  const byKey = new Map(decisions.map((decision) => [decision.recommendationKey, decision]));
  const items = recommendations.map((recommendation) => {
    const decision = byKey.get(recommendation.key);
    return {
      ...recommendation,
      status: (decision?.decision ?? 'open') as RecommendationStatus,
      createdEntityType: decision?.createdEntityType ?? null,
      createdEntityId: decision?.createdEntityId ?? null,
    };
  });
  const current = new Set(recommendations.map((recommendation) => recommendation.key));
  return { items, orphanDecisions: decisions.filter((decision) => !current.has(decision.recommendationKey)) };
}

/** Recommendation keys from user input that are currently recommended and still open. */
export function selectAcceptable(
  items: readonly RecommendationWithStatus[],
  requestedKeys: readonly string[],
): RecommendationWithStatus[] {
  const wanted = new Set(requestedKeys);
  return items.filter((item) => wanted.has(item.key) && item.status === 'open');
}

export function groupByKind<T extends Pick<Recommendation, 'kind'>>(items: readonly T[]): Map<RecommendationKind, T[]> {
  const groups = new Map<RecommendationKind, T[]>();
  for (const kind of RECOMMENDATION_KINDS) groups.set(kind, []);
  for (const item of items) groups.get(item.kind)!.push(item);
  return groups;
}
