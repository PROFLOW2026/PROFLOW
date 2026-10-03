import type { BadgeTone } from '@/components/ui/badge';
import type { InspectionOutcome, InspectionStatus } from '../domain/rules';

export function inspectionStatusTone(status: InspectionStatus): BadgeTone {
  switch (status) {
    case 'scheduled':
      return 'pending';
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'neutral';
    case 'cancelled':
      return 'neutral';
  }
}

export function inspectionOutcomeTone(outcome: InspectionOutcome): BadgeTone {
  switch (outcome) {
    case 'pass':
      return 'success';
    case 'conditional_pass':
      return 'warning';
    case 'fail':
      return 'danger';
  }
}

/** Label for a checklist item: catalog translation when known, stored label otherwise. */
export function checklistItemLabel(
  t: { (key: string): string; has: (key: string) => boolean },
  templateKey: string | null,
  item: { readonly itemKey: string | null; readonly label: string },
): string {
  if (templateKey && item.itemKey) {
    const key = `catalog.${templateKey}.items.${item.itemKey}`;
    if (t.has(key)) return t(key);
  }
  return item.label;
}
