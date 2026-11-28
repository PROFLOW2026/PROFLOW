/** Shared XREF identity. The same triple is used by the index, the viewer, the worker and manual choice. */

export const XREF_PARENT_ABI = 'xref-parent-1';

export interface XrefIdentity {
  readonly parentLogicalId: string;
  readonly blockName: string;
  readonly savedPath: string;
}

export interface ResolvedXref extends XrefIdentity {
  readonly logicalId: string;
}

export function xrefIdentityKey(row: XrefIdentity): string {
  return `${row.parentLogicalId}\u0000${row.blockName}\u0000${row.savedPath}`;
}

/** Two blocks in one parent that share a saved path are still two references. */
export function xrefIdentitiesCollide(a: XrefIdentity, b: XrefIdentity): boolean {
  return xrefIdentityKey(a) === xrefIdentityKey(b);
}

/** Empty saved path stays empty. It is not replaced by the block name. */
export function normalizeSavedPath(savedPath: string | null | undefined): string {
  return savedPath ?? '';
}

export function manualChoiceKey(row: XrefIdentity): string {
  return xrefIdentityKey({
    parentLogicalId: row.parentLogicalId,
    blockName: row.blockName,
    savedPath: normalizeSavedPath(row.savedPath),
  });
}

export interface XrefFileCandidate {
  readonly logicalId: string;
  readonly relativePath: string;
}

export interface XrefChoiceRecord extends XrefIdentity {
  readonly resolvedLogicalId: string | null;
}

/**
 * A stored manual choice wins. Otherwise a non-empty saved path matches one
 * session file by its full path or its file name. An empty path is not guessed,
 * and two files with the same name are not auto-picked.
 */
export function resolveExternalXrefFile(
  files: readonly XrefFileCandidate[],
  choices: readonly XrefChoiceRecord[],
  query: XrefIdentity,
): string | null {
  const saved = normalizeSavedPath(query.savedPath);
  const key = manualChoiceKey({ ...query, savedPath: saved });
  const choice = choices.find((row) => manualChoiceKey(row) === key);
  if (choice?.resolvedLogicalId && files.some((file) => file.logicalId === choice.resolvedLogicalId)) {
    return choice.resolvedLogicalId;
  }
  if (!saved) return null;
  const normalized = saved.replace(/\\/g, '/').toLowerCase();
  const base = normalized.split('/').pop() ?? '';
  const matches = files.filter((file) => {
    const path = file.relativePath.replace(/\\/g, '/').toLowerCase();
    const name = path.split('/').pop() ?? '';
    return path === normalized || (base.length > 0 && name === base);
  });
  const ids = [...new Set(matches.map((file) => file.logicalId))];
  return ids.length === 1 ? ids[0]! : null;
}
