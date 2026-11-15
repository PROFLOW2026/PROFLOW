import type { ProviderFileItem } from '@/modules/external-storage/domain/types';

/** Internal worker / takeoff artifacts that must not appear as selectable plan sources. */
const INTERNAL_NAME =
  /^(legend-mask|preview-|dwg_layout_|symbol-|crop-|takeoff[_-])/i;

const SOURCE_EXT = new Set(['pdf', 'dwg', 'dxf']);

function baseName(name: string): string {
  const trimmed = name.trim();
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export function isTakeoffSourceCloudFile(file: Pick<ProviderFileItem, 'name' | 'mimeType'>): boolean {
  const name = baseName(file.name);
  if (!name || INTERNAL_NAME.test(name)) return false;
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!SOURCE_EXT.has(ext)) return false;
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return false;
  return true;
}

export function filterTakeoffSourceCloudFiles<T extends Pick<ProviderFileItem, 'name' | 'mimeType'>>(
  files: readonly T[],
): T[] {
  return files.filter(isTakeoffSourceCloudFile);
}