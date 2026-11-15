/** True when a provider scope can write, delete, or replace files. */
export function tokenIncludesWriteScope(scopes: readonly string[]): boolean {
  return scopes.some((scope) => {
    const normalized = scope.trim().toLowerCase();
    if (!normalized) return false;
    const leaf = normalized.split(/[\/\s]/).filter(Boolean).pop() ?? '';
    if (leaf === 'drive') return true;
    return normalized.includes('write');
  });
}

export function libraryMayStart(scopes: readonly string[]): boolean {
  return scopes.length > 0 && !tokenIncludesWriteScope(scopes);
}

/** A catalog id is readable only when the provider listed it under the approved root. */
export function isLibraryFileAllowed(fileId: string, rootFileIds: ReadonlySet<string>): boolean {
  return rootFileIds.has(fileId);
}
