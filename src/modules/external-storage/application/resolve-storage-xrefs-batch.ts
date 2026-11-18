import 'server-only';

import { resolveStorageXrefPathAsync } from './resolve-storage-xref';
import { xrefOutcomeToApi, type XrefResolveApiBody } from '../domain/xref-resolve-response';
import type { StorageProviderAdapter } from '../domain/provider-interface';
import type { XrefWalkListing } from '../domain/xref-folder-walk';

export type XrefBatchItem = {
  readonly key: string;
  readonly xrefName: string;
  readonly savedPath?: string | null;
  readonly anchorPath?: string | null;
};

export async function resolveStorageXrefsBatch(input: {
  adapter: StorageProviderAdapter;
  accessToken: string;
  startFolderId: string;
  rootFolderId: string;
  items: readonly XrefBatchItem[];
  gate?: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
}): Promise<Record<string, XrefResolveApiBody>> {
  const listFolderCache = new Map<string, XrefWalkListing>();
  const out: Record<string, XrefResolveApiBody> = {};

  for (const item of input.items) {
    if (!item.key) continue;
    let startFolderId = input.startFolderId;
    const rootFolderId = input.rootFolderId;
    if (item.anchorPath?.trim()) {
      const anchor = await resolveStorageXrefPathAsync({
        adapter: input.adapter,
        accessToken: input.accessToken,
        startFolderId: input.startFolderId,
        rootFolderId,
        xrefName: item.anchorPath,
        savedPath: item.anchorPath,
        gate: input.gate,
        listFolderCache,
      });
      if (anchor.status !== 'found') {
        out[item.key] = xrefOutcomeToApi(anchor);
        continue;
      }
      startFolderId = anchor.folderId;
    }

    const outcome = await resolveStorageXrefPathAsync({
      adapter: input.adapter,
      accessToken: input.accessToken,
      startFolderId,
      rootFolderId,
      xrefName: item.xrefName,
      savedPath: item.savedPath ?? item.xrefName,
      anchorPath: null,
      gate: input.gate,
      listFolderCache,
    });
    out[item.key] = xrefOutcomeToApi(outcome, outcome.status === 'found' ? outcome.folderId : undefined);
  }

  return out;
}