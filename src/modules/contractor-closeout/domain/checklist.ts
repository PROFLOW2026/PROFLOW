import { DomainRuleError } from '@/shared/errors';

export const CLOSEOUT_ITEM_KINDS = [
  'punch_list_clear',
  'final_claim',
  'final_invoice',
  'as_built',
  'om_manuals',
  'warranties_registered',
  'certificates',
  'inspections_complete',
  'training_complete',
  'final_account',
  'retention_release',
  'guarantees',
] as const;

export type CloseoutItemKind = (typeof CLOSEOUT_ITEM_KINDS)[number];

export interface CloseoutChecklistItem {
  readonly itemKind: CloseoutItemKind | 'custom';
  readonly title: string;
  readonly isRequired: boolean;
  readonly sortOrder: number;
}

export const DEFAULT_CLOSEOUT_CHECKLIST: readonly CloseoutChecklistItem[] = CLOSEOUT_ITEM_KINDS.map(
  (kind, index) => ({
    itemKind: kind,
    title: kind,
    isRequired: kind !== 'training_complete',
    sortOrder: index * 10,
  }),
);

export interface CloseoutItemState {
  readonly itemKind: string;
  readonly isRequired: boolean;
  readonly status: string;
}

export function assertCloseoutCompleteness(
  items: readonly CloseoutItemState[],
  overrideReason: string | null | undefined,
): void {
  const blocking = items.filter(
    (item) => item.isRequired && item.status !== 'complete' && item.status !== 'waived',
  );
  if (blocking.length === 0) return;
  if (overrideReason && overrideReason.trim().length > 0) return;
  throw new DomainRuleError(
    'Required closeout items are incomplete',
    'handover.errors.incompleteChecklist',
    { blockingKinds: blocking.map((item) => item.itemKind) },
  );
}
