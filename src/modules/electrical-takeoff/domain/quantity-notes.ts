/**
 * X2 on one symbol means two devices. The symbol is still one mark.
 * X4 and ampere notes such as 2X16A are not multipliers.
 */

/** A number the user set. The times sign is not a letter, so a drawn X4 note is not this. */
const MANUAL = /^×(\d+)$/;
/** Automatic X2 only. X4 and 2X16A do not match. */
const LETTER_PAIR = /^[xX]\s*2$/;

function isOuter(ch: string): boolean {
  if (/[0-9A-Za-z\u00d7]/.test(ch) || /\s/.test(ch) || /[\u0590-\u05FF]/.test(ch)) return false;
  return true;
}

function coreToken(token: string): string {
  let core = token.trim();
  while (core && isOuter(core[0]!)) core = core.slice(1).trim();
  while (core && isOuter(core[core.length - 1]!)) core = core.slice(0, -1).trim();
  return core;
}

function isMultiplierToken(token: string): boolean {
  const core = coreToken(token);
  return MANUAL.test(core) || LETTER_PAIR.test(core);
}

/**
 * Device count for one symbol.
 * A user mark `×N` wins. Otherwise an X2 note means 2. Anything else is 1.
 * A second note does not multiply again.
 */
export function devicesFromNote(tagText: string | null | undefined): number {
  if (!tagText) return 1;
  for (const token of tagText.split(/\s+/)) {
    const match = MANUAL.exec(coreToken(token));
    if (!match) continue;
    const count = Number(match[1]);
    if (count >= 1 && count <= 99) return count;
  }
  for (const token of tagText.split(/\s+/)) {
    if (LETTER_PAIR.test(coreToken(token))) return 2;
  }
  return 1;
}

/** Keep circuit tags. Replace any multiplier with the count the user chose. 1 clears it. */
export function tagWithDeviceCount(tagText: string | null | undefined, count: number): string | null {
  const devices = Math.min(99, Math.max(1, Math.floor(count)));
  const kept = (tagText ?? '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !isMultiplierToken(token));
  if (devices > 1) kept.push(`×${devices}`);
  const text = kept.join(' ');
  return text || null;
}

/** Keep other tag words. Add or remove the X2 note. */
export function tagWithDevicePair(tagText: string | null | undefined, paired: boolean): string | null {
  return tagWithDeviceCount(tagText, paired ? 2 : 1);
}
