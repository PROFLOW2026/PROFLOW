/** Folder naming for the infrastructure tree in the organization's cloud storage (pure). */

export const INFRA_ROOT_FOLDER_NAME = 'תיעוד תשתיות';
export const MAX_FOLDER_NAME_LENGTH = 120;

/** OneDrive / Drive / Dropbox / Box forbid these characters in names. */
export function sanitizeInfraFolderName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
    .slice(0, MAX_FOLDER_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : 'מיקום';
}

/** Folder name for a location: "name" or "code - name" when the code is not already in the name. */
export function infraFolderNameForLocation(node: { readonly name: string; readonly code: string | null }): string {
  const name = node.name.trim();
  const code = node.code?.trim();
  if (code && !name.toLocaleLowerCase().includes(code.toLocaleLowerCase())) {
    return sanitizeInfraFolderName(`${code} - ${name}`);
  }
  return sanitizeInfraFolderName(name);
}

/**
 * Makes a sibling-unique folder name: a name already taken by another location's folder gets
 * " (2)", " (3)", ... so two sibling locations never collapse into one provider folder.
 */
export function uniqueFolderName(base: string, taken: ReadonlySet<string>): string {
  const lowered = new Set([...taken].map((name) => name.toLocaleLowerCase()));
  if (!lowered.has(base.toLocaleLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!lowered.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

/** Evidence file name for the original photo - unique and sortable, no personal data. */
export function infraPhotoFileName(input: { capturedAt: Date; clientCaptureId: string; extension: string }): string {
  const iso = input.capturedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ext = input.extension.replace(/^\./, '').toLowerCase() || 'jpg';
  return `infra-${iso}-${input.clientCaptureId.slice(0, 8)}.${ext}`;
}

export function annotatedFileName(originalFileName: string, version: number): string {
  const dot = originalFileName.lastIndexOf('.');
  const stem = dot > 0 ? originalFileName.slice(0, dot) : originalFileName;
  return `${stem}-marked-v${version}.jpg`;
}

export function comparisonSidecarName(comparisonId: string): string {
  return `comparison-${comparisonId.slice(0, 8)}.json`;
}
