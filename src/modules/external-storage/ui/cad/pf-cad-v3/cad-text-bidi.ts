const HEBREW = /[\u0590-\u05FF]/;
/** Cable marks, decimals and multipliers stay LTR even inside a Hebrew line. */
const LTR_ATOM = /[A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?(?:[xX×]\d+(?:\.\d+)?)*/g;

export function cadLineHasHebrew(text: string): boolean {
  return HEBREW.test(text);
}

/**
 * AutoCAD `bx` mirrors the whole glyph run. That is correct for visual-order SHX,
 * but after we decode to logical Unicode it also mirrors `1.5` into `5.1`.
 */
export function shouldApplyCadBackwardsMirror(
  text: string,
  bx: boolean | number | undefined,
): boolean {
  const mirrored =
    bx === true || (typeof bx === 'number' && Number.isFinite(bx) && bx !== 0 && bx !== 1);
  if (!mirrored) return false;
  if (HEBREW.test(text)) return false;
  return true;
}

/**
 * SHX draws one glyph after another left-to-right. Convert logical Unicode to
 * visual order while keeping European numbers and CAD identifiers intact.
 */
export function cadShxVisualLine(logical: string): string {
  if (!HEBREW.test(logical)) return logical;
  const flipped = [...logical].reverse().join('');
  return flipped.replace(LTR_ATOM, (atom) => [...atom].reverse().join(''));
}
