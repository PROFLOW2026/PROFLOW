/** Fix common UTF-8-as-Latin1 mojibake in worker/file names without inventing labels. */
export function formatTakeoffDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/[\u0590-\u05FF]/.test(trimmed)) return trimmed;
  const looksMojibake = trimmed.includes('×') || /[ÃØÙÂ]/.test(trimmed);
  if (!looksMojibake) return trimmed;
  try {
    const bytes = Uint8Array.from(trimmed, (c) => c.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[\u0590-\u05FF]/.test(decoded) || decoded.length < trimmed.length) return decoded.trim();
  } catch {
    /* keep original */
  }
  return trimmed;
}