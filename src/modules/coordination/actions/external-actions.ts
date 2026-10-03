'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import { respondToCoordinationEvent } from '../application/external';
import type { RespondToEventInput } from '../validation/schemas';
import { coordinationActionError, type CoordinationActionResult } from './action-result';

/**
 * Contractor portal action. External principals never get an OrgContext: the session loader
 * (Track C) yields an ExternalContext whose executor is RLS-bound to the principal, and the
 * use-case re-checks ext.event.respond on the invitation's exact scope.
 */
export async function respondToCoordinationEventAction(
  input: RespondToEventInput,
): Promise<CoordinationActionResult<{ responseId: string }>> {
  try {
    const context = await requireExternalContext();
    const result = await respondToCoordinationEvent(context, input);
    refresh();
    return { ok: true, data: { responseId: result.responseId } };
  } catch (error) {
    unstable_rethrow(error);
    return coordinationActionError(error);
  }
}
