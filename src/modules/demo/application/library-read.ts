import 'server-only';

import { isLibraryFileAllowed, libraryMayStart, tokenIncludesWriteScope } from '../domain/library-policy';

export interface DemoLibraryAdapter {
  readonly scopes: readonly string[];
  listRootFileIds(): Promise<readonly string[]>;
  download(fileId: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string } | null>;
}

export function assertDemoLibraryReadable(scopes: readonly string[]): void {
  if (!libraryMayStart(scopes) || tokenIncludesWriteScope(scopes)) {
    throw new Error('demo library token can write');
  }
}

export async function readDemoLibraryFile(
  adapter: DemoLibraryAdapter,
  fileId: string,
): Promise<{ readonly bytes: Uint8Array; readonly contentType: string } | null> {
  assertDemoLibraryReadable(adapter.scopes);
  const root = new Set(await adapter.listRootFileIds());
  if (!isLibraryFileAllowed(fileId, root)) return null;
  return adapter.download(fileId);
}
