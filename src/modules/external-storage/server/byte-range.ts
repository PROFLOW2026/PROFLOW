export type ParsedByteRange = { start: number; end: number };

export function parseByteRangeHeader(
  header: string | null,
  sizeBytes: number,
): ParsedByteRange | 'unsatisfiable' | null {
  if (!header?.toLowerCase().startsWith('bytes=')) return null;
  if (sizeBytes <= 0) return 'unsatisfiable';

  const spec = header.slice(header.indexOf('=') + 1).trim();
  const [rangePart] = spec.split(',');
  if (!rangePart) return null;

  const match = /^(\d*)-(\d*)$/.exec(rangePart.trim());
  if (!match) return null;

  const startStr = match[1] ?? '';
  const endStr = match[2] ?? '';

  let start: number;
  let end: number;

  if (startStr === '' && endStr === '') return null;

  if (startStr === '') {
    const suffixLength = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, sizeBytes - suffixLength);
    end = sizeBytes - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    if (!Number.isFinite(start) || start < 0) return null;
    end = endStr === '' ? sizeBytes - 1 : Number.parseInt(endStr, 10);
    if (!Number.isFinite(end)) return null;
  }

  if (start > end || start >= sizeBytes) return 'unsatisfiable';
  end = Math.min(end, sizeBytes - 1);
  return { start, end };
}

export function buildContentRange(start: number, end: number, total: number): string {
  return `bytes ${start}-${end}/${total}`;
}

export function buildContentDisposition(
  filename: string,
  disposition: 'inline' | 'attachment',
): string {
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}
