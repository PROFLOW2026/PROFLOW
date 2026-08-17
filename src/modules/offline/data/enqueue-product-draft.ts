import type { DraftKind, EnqueueDraftInput, OfflineDraftRecord } from '../domain/types';
import { assertOfflineDraftAllowed } from '../domain/financial-guard';
import { getDraftQueue, type DraftQueue } from './draft-queue';
import { mirrorDraftsToLocalStorage } from './queue-index';

export interface EnqueueProductDraftInput<TPayload extends Record<string, unknown>> {
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: Exclude<DraftKind, 'capture'>;
  readonly payload: TPayload;
  readonly localId?: string;
  readonly serverId?: string | null;
  readonly serverUpdatedAt?: string | null;
  readonly allowDuplicate?: boolean;
}

/**
 * Persist a product draft locally. Does not call the server and does not
 * invent a sync-success state - status is `queued` until reconnect sync.
 * Refuses offline financial finalization payloads.
 */
export async function enqueueProductDraft<TPayload extends Record<string, unknown>>(
  input: EnqueueProductDraftInput<TPayload>,
  deps: { readonly queue?: DraftQueue } = {},
): Promise<OfflineDraftRecord<TPayload>> {
  assertOfflineDraftAllowed(input.kind, input.payload);
  const queue = deps.queue ?? getDraftQueue();
  const enqueueInput: EnqueueDraftInput<TPayload> = {
    organizationId: input.organizationId,
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    localId: input.localId,
    serverId: input.serverId ?? null,
    serverUpdatedAt: input.serverUpdatedAt ?? null,
    allowDuplicate: input.allowDuplicate,
  };
  const draft = await queue.enqueue(enqueueInput);
  const all = await queue.list({
    organizationId: input.organizationId,
    userId: input.userId,
    pendingOnly: false,
  });
  mirrorDraftsToLocalStorage(all);
  return draft as OfflineDraftRecord<TPayload>;
}
