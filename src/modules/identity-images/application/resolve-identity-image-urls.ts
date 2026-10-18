import 'server-only';

import { getStoragePort } from '@/shared/ports/storage';

/** Batch-sign download URLs for stored identity image keys. Missing/invalid keys → null. */
export async function resolveIdentityImageUrls(
  keys: ReadonlyMap<string, string | null | undefined>,
  expiresInSeconds = 60 * 60,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const storage = getStoragePort();
  if (!storage.configured) {
    for (const id of keys.keys()) out.set(id, null);
    return out;
  }

  await Promise.all(
    [...keys.entries()].map(async ([id, key]) => {
      if (!key) {
        out.set(id, null);
        return;
      }
      try {
        const signed = await storage.createDownloadUrl(key, expiresInSeconds);
        out.set(id, signed.url);
      } catch {
        out.set(id, null);
      }
    }),
  );
  return out;
}

export async function resolveIdentityImageUrl(
  key: string | null | undefined,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!key) return null;
  const map = await resolveIdentityImageUrls(new Map([['one', key]]), expiresInSeconds);
  return map.get('one') ?? null;
}
