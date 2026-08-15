import { recordActivityEvent } from '@/modules/clients';
import type { OrgContext } from '@/shared/auth/context';

type QuoteActivityKind = 'quote_created' | 'quote_submitted' | 'quote_approved' | 'project_created';

/**
 * Pointer into `activity_events` when a client is known.
 * Canonical client timeline already projects `estimates` once they have clientId;
 * these rows fill the gap until that projection runs and are deduped by kind+entity.
 */
export async function recordQuoteClientActivity(
  context: OrgContext,
  input: {
    readonly clientId: string | null | undefined;
    readonly projectId?: string | null;
    readonly kind: QuoteActivityKind;
    readonly entityType: 'estimate' | 'project';
    readonly entityId: string;
    readonly summary: string;
    readonly deepLink: string;
  },
): Promise<void> {
  if (!input.clientId) return;
  await recordActivityEvent(context, {
    clientId: input.clientId,
    projectId: input.projectId ?? null,
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    deepLink: input.deepLink,
  });
}
