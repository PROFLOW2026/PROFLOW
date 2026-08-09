import type { DraftKind, EnqueueDraftInput, OfflineDraftRecord } from '../domain/types';
import { getDraftQueue, type DraftQueue } from './draft-queue';
import { mirrorDraftsToLocalStorage } from './queue-index';

export interface EnqueueProductDraftInput<TPayload extends Record<string, unknown>> {
  readonly organizationId: string;
  readonly kind: Exclude<DraftKind, 'capture'>;
  readonly payload: TPayload;
  readonly localId?: string;
  readonly serverId?: string | null;
  readonly serverUpdatedAt?: string | null;
}

/**
 * Persist a product draft locally. Does not call the server and does not
 * invent a sync-success state — status is `queued` until reconnect sync.
 */
export async function enqueueProductDraft<TPayload extends Record<string, unknown>>(
  input: EnqueueProductDraftInput<TPayload>,
  deps: { readonly queue?: DraftQueue } = {},
): Promise<OfflineDraftRecord<TPayload>> {
  const queue = deps.queue ?? getDraftQueue();
  const enqueueInput: EnqueueDraftInput<TPayload> = {
    organizationId: input.organizationId,
    kind: input.kind,
    payload: input.payload,
    localId: input.localId,
    serverId: input.serverId ?? null,
    serverUpdatedAt: input.serverUpdatedAt ?? null,
  };
  const draft = await queue.enqueue(enqueueInput);
  const all = await queue.list({ organizationId: input.organizationId, pendingOnly: false });
  mirrorDraftsToLocalStorage(all);
  return draft as OfflineDraftRecord<TPayload>;
}
