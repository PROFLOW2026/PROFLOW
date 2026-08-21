/**
 * Persona-based recommended report pack order — presentation only.
 */

import type { ExperiencePersonaKey } from '@/modules/tenancy/domain/experience-persona';
import type { ReportKind } from './types';

const PERSONA_RECOMMENDED_KINDS: Readonly<
  Record<ExperiencePersonaKey, readonly ReportKind[]>
> = {
  project_contractor: [
    'project_status',
    'project_financial_summary',
    'change_order_summary',
    'boq_progress',
    'vendor_subcontract_summary',
  ],
  electrical: [
    'project_status',
    'quote_estimate',
    'project_financial_summary',
    'field_daily',
    'punch_inspection',
  ],
  renovation: [
    'project_status',
    'quote_estimate',
    'project_financial_summary',
    'change_order_summary',
    'punch_inspection',
  ],
  small_works: ['project_status', 'quote_estimate', 'project_financial_summary'],
  service: ['field_daily', 'punch_inspection', 'project_status', 'quote_estimate'],
  architecture: ['project_status', 'quote_estimate', 'project_financial_summary'],
  consulting: ['project_status', 'project_financial_summary', 'quote_estimate'],
  inspection: ['punch_inspection', 'field_daily', 'project_status'],
  mixed: [
    'project_status',
    'project_financial_summary',
    'quote_estimate',
    'field_daily',
    'change_order_summary',
    'client_360',
    'labor_utilization',
  ],
  all: [
    'project_status',
    'project_financial_summary',
    'quote_estimate',
    'boq_progress',
    'change_order_summary',
    'field_daily',
    'punch_inspection',
    'vendor_subcontract_summary',
    'client_360',
    'vendor_360',
    'contract_portfolio',
    'labor_utilization',
    'retention_schedule',
    'crm_funnel',
    'month_close_completeness',
  ],
};

export function recommendedReportKindsForPersona(
  persona: ExperiencePersonaKey,
): readonly ReportKind[] {
  return PERSONA_RECOMMENDED_KINDS[persona];
}

/**
 * Split enabled kinds into recommended-first and the remainder (“all reports”).
 * Recommended list is filtered to enabled kinds and preserves persona priority.
 */
export function prioritizeReportKindsForPersona(
  enabledKinds: readonly ReportKind[],
  persona: ExperiencePersonaKey,
): {
  readonly recommended: readonly ReportKind[];
  readonly all: readonly ReportKind[];
} {
  const enabled = new Set(enabledKinds);
  const recommended = recommendedReportKindsForPersona(persona).filter((kind) =>
    enabled.has(kind),
  );
  const recommendedSet = new Set(recommended);
  const all = enabledKinds.filter((kind) => !recommendedSet.has(kind));
  // Full list for “כל הדוחות”: recommended first, then the rest
  const orderedAll = [...recommended, ...all];
  return { recommended, all: orderedAll };
}
