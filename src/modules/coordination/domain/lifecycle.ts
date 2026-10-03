import type { CoordinationEventStatus, CoordinationOutcome } from '@drizzle/schema';
import type { CoordinationAcknowledgementItem } from '@drizzle/schema';

/**
 * Coordination event lifecycle (pure).
 *
 *   scheduled --outcome--> completed | partially_completed | postponed | cancelled
 *   postponed --reschedule--> scheduled
 *   postponed --outcome--> cancelled
 *
 * completed / partially_completed / cancelled are final. Contractors answer only while scheduled.
 */

export const FINAL_EVENT_STATUSES: readonly CoordinationEventStatus[] = [
  'completed',
  'partially_completed',
  'cancelled',
];

export function isFinalStatus(status: CoordinationEventStatus): boolean {
  return FINAL_EVENT_STATUSES.includes(status);
}

export function acceptsResponses(status: CoordinationEventStatus): boolean {
  return status === 'scheduled';
}

export function canReschedule(status: CoordinationEventStatus): boolean {
  return status === 'scheduled' || status === 'postponed';
}

export function canEditDetails(status: CoordinationEventStatus): boolean {
  return status === 'scheduled' || status === 'postponed';
}

export function allowedOutcomes(status: CoordinationEventStatus): readonly CoordinationOutcome[] {
  if (status === 'scheduled') return ['completed', 'partially_completed', 'postponed', 'cancelled'];
  if (status === 'postponed') return ['cancelled'];
  return [];
}

export function canRecordOutcome(status: CoordinationEventStatus, outcome: CoordinationOutcome): boolean {
  return allowedOutcomes(status).includes(outcome);
}

export function outcomeRequiresActualTimes(outcome: CoordinationOutcome): boolean {
  return outcome === 'completed' || outcome === 'partially_completed';
}

export function outcomeRequiresNote(outcome: CoordinationOutcome): boolean {
  return outcome !== 'completed';
}

/** The event status after an outcome is recorded (1:1 today, kept explicit). */
export function statusAfterOutcome(outcome: CoordinationOutcome): CoordinationEventStatus {
  return outcome;
}

/** Stable key for an acknowledgement label ("Safety briefing read" -> "safety_briefing_read"). */
export function acknowledgementKey(label: string, index: number): string {
  const slug = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : `ack_${index + 1}`;
}

/** Normalizes free-text acknowledgement labels into unique keyed items (order kept, blanks dropped). */
export function normalizeAcknowledgements(
  labels: readonly string[],
  existing: readonly CoordinationAcknowledgementItem[] = [],
): CoordinationAcknowledgementItem[] {
  const items: CoordinationAcknowledgementItem[] = [...existing];
  const used = new Set(existing.map((item) => item.key));
  const seenLabels = new Set(existing.map((item) => item.label.trim().toLowerCase()));
  labels.forEach((rawLabel) => {
    const label = rawLabel.trim();
    if (!label || seenLabels.has(label.toLowerCase())) return;
    const base = acknowledgementKey(label, items.length);
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    seenLabels.add(label.toLowerCase());
    items.push({ key, label: label.slice(0, 200) });
  });
  return items;
}

/** Whether the preparation deadline has passed for a party that is not ready yet. */
export function isPreparationOverdue(preparationDeadline: Date | null, now: Date): boolean {
  return preparationDeadline !== null && preparationDeadline.getTime() < now.getTime();
}
