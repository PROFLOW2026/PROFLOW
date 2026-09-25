import type { OrgContext } from '@/shared/auth/context';
import type { CommandCenterInbox } from '../domain/types';
import { getActionableInbox } from './get-actionable-inbox';

/**
 * Aggregates actionable Today items for anyone with `command_center.read`.
 * Visibility is permission-gated, not an optional-module toggle.
 *
 * Reminder generation is not run here. A deadline-capped notification scan
 * on this request skipped later task and financial scanners and discarded
 * the result, so Today had no signal that the scan was partial. Collectors
 * for the inbox still run through `getActionableInbox`.
 */
export async function getTodayInbox(context: OrgContext): Promise<CommandCenterInbox> {
  return getActionableInbox(context);
}
