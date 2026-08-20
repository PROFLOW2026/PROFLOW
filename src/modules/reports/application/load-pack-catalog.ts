import { listProjectsForOrg } from '@/modules/projects';
import { listQuotesForOrg } from '@/modules/quotes';
import {
  getBusinessProfileKeyForOrg,
  getModuleVisibility,
  personaForBusinessProfile,
} from '@/modules/tenancy';
import type { ExperiencePersonaKey } from '@/modules/tenancy/domain/experience-persona';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { REPORT_KIND_DEFINITIONS } from '../domain/kinds';
import { prioritizeReportKindsForPersona } from '../domain/persona-pack-order';
import type { ReportKind, ReportPackOption } from '../domain/types';

export interface ReportPackCatalog {
  readonly projects: readonly ReportPackOption[];
  readonly quotes: readonly ReportPackOption[];
  readonly enabledKinds: readonly ReportKind[];
  readonly recommendedKinds: readonly ReportKind[];
  /** Recommended first, then remaining — for “כל הדוחות”. */
  readonly orderedKinds: readonly ReportKind[];
  readonly persona: ExperiencePersonaKey;
}

export async function loadReportPackCatalog(context: OrgContext): Promise<ReportPackCatalog> {
  const modules = await getModuleVisibility(context);
  const enabledKinds = REPORT_KIND_DEFINITIONS.filter((definition) => {
    if (!hasPermission(context, definition.permission)) return false;
    if (definition.kind === 'boq_progress' && !modules.boq) return false;
    if (definition.kind === 'change_order_summary' && !modules.changes) return false;
    if (definition.kind === 'quote_estimate' && !modules.quotes) return false;
    if (definition.kind === 'field_daily' && !modules.field_ops) return false;
    if (definition.kind === 'punch_inspection' && !modules.field_ops) return false;
    if (definition.kind === 'vendor_subcontract_summary' && !modules.vendors) return false;
    return true;
  }).map((definition) => definition.kind);

  const profileKey = await getBusinessProfileKeyForOrg(context.db, context.organizationId);
  const persona = personaForBusinessProfile(profileKey);
  const { recommended, all: orderedKinds } = prioritizeReportKindsForPersona(
    enabledKinds,
    persona,
  );

  const projects = hasPermission(context, PERMISSIONS.PROJECTS_READ)
    ? (await listProjectsForOrg(context, { limit: 80 })).map((project) => ({
        id: project.id,
        label: project.name,
      }))
    : [];

  const quotes =
    hasPermission(context, PERMISSIONS.QUOTES_READ) && modules.quotes
      ? (await listQuotesForOrg(context)).slice(0, 80).map((quote) => ({
          id: quote.id,
          label: quote.clientName ? `${quote.title} · ${quote.clientName}` : quote.title,
        }))
      : [];

  return {
    projects,
    quotes,
    enabledKinds,
    recommendedKinds: recommended,
    orderedKinds,
    persona,
  };
}
