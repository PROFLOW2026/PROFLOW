import type { TakeoffEdit } from './contracts';

const QUANTITY_EDIT = new Set<TakeoffEdit['op']>(['add', 'delete', 'restore', 'reclassify', 'set_note']);

/**
 * The user confirmed they inspected the plan for devices the engine missed.
 * A later quantity edit clears the confirmation.
 */
export function planReviewConfirmed(edits: readonly TakeoffEdit[]): boolean {
  let confirmed = false;
  for (const edit of edits) {
    if (edit.op === 'confirm_plan_review') confirmed = edit.confirmed;
    else if (QUANTITY_EDIT.has(edit.op)) confirmed = false;
  }
  return confirmed;
}
