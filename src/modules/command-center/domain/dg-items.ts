import { PROJECT_CAPABILITIES as C, type ProjectCapability } from '@/modules/project-team/domain/capabilities';
import { daysBetween, type BusinessDate } from '@/shared/dates';
import type { CommandCenterCopyScope } from './item-copy';
import { withItemDefaults } from './ranking';
import type { CommandCenterItem, CommandCenterSeverity, DgSourceType } from './types';

/**
 * Developer / GC Command Center items. Each domain track exposes a query (a "port") returning only
 * ACTIONABLE rows for the projects it is given; this module turns them into ranked, localized
 * items. Authorization (project capability) is applied by the collector before and after the port.
 */

export interface DgCommandCenterRow {
  /** Source entity id (claim, event, task, defect, RFI, requirement, submittal, ...). */
  readonly id: string;
  readonly projectId: string;
  readonly projectName?: string | null;
  readonly vendorName?: string | null;
  /** Short human reference (number / code / title). Never money. */
  readonly reference?: string | null;
  /** Due / start / expiry date (YYYY-MM-DD) depending on the item kind. */
  readonly dueDate?: string | null;
  /** When the item started waiting (submitted at, requested at). */
  readonly since?: Date | string | null;
  /** Acknowledgement subject for `dg_acknowledgement_overdue`. */
  readonly kind?: 'instruction' | 'plan_revision' | 'coordination_event' | 'document' | null;
  /** Payment eligibility: claim the hold applies to (falls back to the agreement). */
  readonly claimId?: string | null;
  readonly agreementId?: string | null;
  /** Payment eligibility hold reasons (e.g. missing_invoice, expired_insurance). */
  readonly reasons?: readonly string[] | null;
}

export type DgWhyMode = 'overdue' | 'waiting' | 'upcoming' | 'expiry' | 'reasons';

export interface DgItemDefinition {
  readonly sourceType: DgSourceType;
  /** Any-of: the viewer must hold one of these on the row's project. */
  readonly capabilities: readonly ProjectCapability[];
  readonly whyMode: DgWhyMode;
  /** Upcoming / expiry items further away than this are not actionable yet. */
  readonly horizonDays?: number;
  readonly href: (row: DgCommandCenterRow) => string;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const safe = (value: string | null | undefined): string | null => (value && SAFE_ID.test(value) ? value : null);

function projectHref(row: DgCommandCenterRow, ...parts: (string | null)[]): string {
  const projectId = safe(row.projectId);
  if (!projectId) return '/projects';
  if (parts.some((part) => part === null)) return `/projects/${projectId}`;
  return ['/projects', projectId, ...parts].join('/');
}

function acknowledgementHref(row: DgCommandCenterRow): string {
  switch (row.kind) {
    case 'instruction':
      return projectHref(row, 'instructions', safe(row.id));
    case 'plan_revision':
      return projectHref(row, 'plans');
    case 'coordination_event':
      return projectHref(row, 'coordination', safe(row.id));
    default:
      return projectHref(row);
  }
}

export const DG_ITEM_DEFINITIONS: Readonly<Record<DgSourceType, DgItemDefinition>> = {
  dg_claim_awaiting_review: {
    sourceType: 'dg_claim_awaiting_review',
    capabilities: [C.CLAIM_REVIEW],
    whyMode: 'waiting',
    href: (row) => projectHref(row, 'claims', safe(row.id)),
  },
  dg_coordination_blocked: {
    sourceType: 'dg_coordination_blocked',
    capabilities: [C.SCHEDULE_MANAGE, C.CONTRACTOR_COORDINATE],
    whyMode: 'upcoming',
    horizonDays: 14,
    href: (row) => projectHref(row, 'coordination', safe(row.id)),
  },
  dg_acknowledgement_overdue: {
    sourceType: 'dg_acknowledgement_overdue',
    capabilities: [C.CONTRACTOR_COORDINATE, C.DOCUMENTS_SHARE],
    whyMode: 'overdue',
    href: acknowledgementHref,
  },
  dg_critical_task_overdue: {
    sourceType: 'dg_critical_task_overdue',
    capabilities: [C.TASKS_MANAGE],
    whyMode: 'overdue',
    href: (row) => (safe(row.id) ? `/tasks/${row.id}` : projectHref(row)),
  },
  dg_defect_awaiting_verification: {
    sourceType: 'dg_defect_awaiting_verification',
    capabilities: [C.DEFECTS_MANAGE],
    whyMode: 'waiting',
    href: (row) => projectHref(row, 'defects', safe(row.id)),
  },
  dg_rfi_overdue: {
    sourceType: 'dg_rfi_overdue',
    capabilities: [C.RFI_MANAGE],
    whyMode: 'overdue',
    href: (row) => projectHref(row, 'rfi', safe(row.id)),
  },
  dg_compliance_expiring: {
    sourceType: 'dg_compliance_expiring',
    capabilities: [C.CONTRACTOR_COORDINATE],
    whyMode: 'expiry',
    horizonDays: 30,
    href: (row) => projectHref(row, 'contractor-compliance'),
  },
  dg_submittal_pending: {
    sourceType: 'dg_submittal_pending',
    capabilities: [C.SUBMITTAL_MANAGE],
    whyMode: 'waiting',
    href: (row) => projectHref(row, 'submittals', safe(row.id)),
  },
  dg_payment_eligibility_blocked: {
    sourceType: 'dg_payment_eligibility_blocked',
    capabilities: [C.PAYMENT_MANAGE],
    whyMode: 'reasons',
    href: (row) =>
      safe(row.claimId ?? null)
        ? projectHref(row, 'claims', safe(row.claimId ?? null))
        : projectHref(row, 'contractors', safe(row.agreementId ?? null)),
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value: string | null | undefined): BusinessDate | null {
  return value && ISO_DATE.test(value) ? (value as BusinessDate) : null;
}

function sinceDate(value: Date | string | null | undefined): BusinessDate | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) as BusinessDate;
}

interface Timing {
  readonly actionable: boolean;
  readonly urgencyBump: number;
  readonly why: (scope: CommandCenterCopyScope) => string;
  readonly severity?: CommandCenterSeverity;
}

function timing(definition: DgItemDefinition, row: DgCommandCenterRow, today: BusinessDate): Timing {
  const fallbackWhy = (scope: CommandCenterCopyScope) => scope.t(`dg.${definition.sourceType}.why`);
  switch (definition.whyMode) {
    case 'overdue': {
      const due = isoDate(row.dueDate);
      if (!due) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      const days = daysBetween(due, today);
      if (days <= 0) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      return {
        actionable: true,
        urgencyBump: Math.min(99, days * 3),
        why: (scope) => scope.t('dg.why.overdue', { days, date: due }),
      };
    }
    case 'waiting': {
      const since = sinceDate(row.since);
      const days = since ? Math.max(0, daysBetween(since, today)) : 0;
      return {
        actionable: true,
        urgencyBump: Math.min(99, days * 2),
        why: since ? (scope) => scope.t('dg.why.waiting', { days }) : fallbackWhy,
      };
    }
    case 'upcoming': {
      const due = isoDate(row.dueDate);
      if (!due) return { actionable: true, urgencyBump: 0, why: fallbackWhy };
      const daysLeft = daysBetween(today, due);
      if (daysLeft > (definition.horizonDays ?? 14)) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      return {
        actionable: true,
        urgencyBump: Math.min(99, Math.max(0, 99 - Math.max(0, daysLeft) * 7)),
        why: (scope) =>
          daysLeft < 0 ? scope.t('dg.why.overdue', { days: -daysLeft, date: due }) : scope.t('dg.why.startsOn', { date: due }),
      };
    }
    case 'expiry': {
      const due = isoDate(row.dueDate);
      if (!due) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      const daysLeft = daysBetween(today, due);
      if (daysLeft > (definition.horizonDays ?? 30)) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      const expired = daysLeft < 0;
      return {
        actionable: true,
        urgencyBump: expired ? 99 : Math.min(98, Math.max(0, 98 - daysLeft * 3)),
        severity: expired ? 'high' : undefined,
        why: (scope) => scope.t(expired ? 'dg.why.expired' : 'dg.why.expiresOn', { date: due }),
      };
    }
    case 'reasons': {
      const reasons = (row.reasons ?? []).filter((reason) => /^[a-z][a-z0-9_]*$/.test(reason));
      if (reasons.length === 0) return { actionable: false, urgencyBump: 0, why: fallbackWhy };
      return {
        actionable: true,
        urgencyBump: Math.min(99, reasons.length * 10),
        why: (scope) =>
          reasons
            .map((reason) => (scope.t.has(`dg.reasons.${reason}`) ? scope.t(`dg.reasons.${reason}`) : scope.t('dg.reasons.other')))
            .join(' · '),
      };
    }
  }
}

function whatFor(scope: CommandCenterCopyScope, sourceType: DgSourceType, reference: string | null): string {
  return reference
    ? scope.t(`dg.${sourceType}.whatWithReference`, { reference })
    : scope.t(`dg.${sourceType}.what`);
}

function whereFor(scope: CommandCenterCopyScope, row: DgCommandCenterRow): string {
  const parts = [row.projectName, row.vendorName].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : scope.t('itemCopy.where.project');
}

const MAX_REFERENCE = 80;

/** Pure: rows from a port -> Command Center items (non-actionable rows are dropped). */
export function buildDgItems(input: {
  readonly definition: DgItemDefinition;
  readonly rows: readonly DgCommandCenterRow[];
  readonly scope: CommandCenterCopyScope;
  readonly today: BusinessDate;
  readonly cap: number;
}): CommandCenterItem[] {
  const seen = new Set<string>();
  const items: CommandCenterItem[] = [];
  for (const row of input.rows) {
    if (!row.id || seen.has(row.id)) continue;
    const when = timing(input.definition, row, input.today);
    if (!when.actionable) continue;
    seen.add(row.id);
    const reference = row.reference?.trim() ? row.reference.trim().slice(0, MAX_REFERENCE) : null;
    items.push(
      withItemDefaults({
        sourceType: input.definition.sourceType,
        sourceId: row.id,
        what: whatFor(input.scope, input.definition.sourceType, reference),
        why: when.why(input.scope),
        where: whereFor(input.scope, row),
        href: input.definition.href(row),
        severity: when.severity,
        urgencyBump: when.urgencyBump,
        meta: { projectId: row.projectId, dueDate: row.dueDate ?? null },
      }),
    );
  }
  return items
    .sort((a, b) => b.rankScore - a.rankScore || a.itemKey.localeCompare(b.itemKey))
    .slice(0, input.cap);
}
