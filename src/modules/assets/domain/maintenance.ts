import type { MaintenanceStatus } from './types';

/**
 * Maintenance scheduling is derived from status + performed_on only.
 * No notification delivery — UI surfaces overdue/upcoming lists.
 */

const TERMINAL: ReadonlySet<MaintenanceStatus> = new Set(['completed', 'cancelled']);

const TRANSITIONS: Readonly<Record<MaintenanceStatus, readonly MaintenanceStatus[]>> = {
  planned: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['planned', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export type MaintenanceScheduleBucket = 'overdue' | 'upcoming' | 'other';

export function isTerminalMaintenanceStatus(status: MaintenanceStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionMaintenanceStatus(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertMaintenanceStatusTransition(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
): void {
  if (!canTransitionMaintenanceStatus(from, to)) {
    throw new Error(`Invalid maintenance transition: ${from} → ${to}`);
  }
}

export function allowedMaintenanceTransitions(
  from: MaintenanceStatus,
): readonly MaintenanceStatus[] {
  return TRANSITIONS[from];
}

/**
 * Classify a maintenance row for overdue / upcoming boards.
 * - overdue: open work (planned | in_progress) with performed_on before today
 * - upcoming: planned work with performed_on in [today, today+upcomingDays]
 * - other: everything else (no date, completed, cancelled, far-future, etc.)
 */
export function classifyMaintenanceSchedule(
  record: {
    readonly status: MaintenanceStatus;
    readonly performedOn: string | null;
  },
  today: string,
  upcomingDays = 30,
): MaintenanceScheduleBucket {
  if (record.status === 'completed' || record.status === 'cancelled') return 'other';
  if (!record.performedOn) return 'other';

  if (record.performedOn < today) {
    if (record.status === 'planned' || record.status === 'in_progress') return 'overdue';
    return 'other';
  }

  if (record.status === 'planned') {
    const end = addCalendarDays(today, upcomingDays);
    if (record.performedOn <= end) return 'upcoming';
  }

  return 'other';
}

export function partitionMaintenanceBySchedule<
  T extends { readonly status: MaintenanceStatus; readonly performedOn: string | null },
>(records: readonly T[], today: string, upcomingDays = 30): {
  overdue: T[];
  upcoming: T[];
  other: T[];
} {
  const overdue: T[] = [];
  const upcoming: T[] = [];
  const other: T[] = [];
  for (const record of records) {
    const bucket = classifyMaintenanceSchedule(record, today, upcomingDays);
    if (bucket === 'overdue') overdue.push(record);
    else if (bucket === 'upcoming') upcoming.push(record);
    else other.push(record);
  }
  return { overdue, upcoming, other };
}

/** Wave 4: `asset` is a supported document_owner_type. */
export function assetDocumentOwnerType(): 'asset' {
  return 'asset';
}

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
