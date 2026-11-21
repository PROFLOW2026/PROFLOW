const HEBREW = /[\u0590-\u05FF]/;
const DIGIT = /\d/;
/** Cable marks, decimals and multipliers stay LTR even inside a Hebrew line. */
const LTR_ATOM = /[A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?(?:[xX×]\d+(?:\.\d+)?)*/g;
const LRE = '\u202A';
const LRO = '\u202D';
const PDF = '\u202C';

export function cadLineHasHebrew(text: string): boolean {
  return HEBREW.test(text);
}

function isBackwardsFlag(bx: boolean | number | undefined): boolean {
  return bx === true || (typeof bx === 'number' && Number.isFinite(bx) && bx !== 0 && bx !== 1);
}

/**
 * AutoCAD `bx` is an RTL / backwards *layout* flag. Geometric `scale(-1, 1)`
 * mirrors the whole glyph run and turns logical `1.5` into `5.1`.
 * Never apply that mirror when the run has Hebrew or digits.
 */
export function shouldApplyCadBackwardsMirror(
  text: string,
  bx: boolean | number | undefined,
): boolean {
  if (!isBackwardsFlag(bx)) return false;
  if (HEBREW.test(text) || DIGIT.test(text)) return false;
  return true;
}

/**
 * SHX and canvas-LTR draw one glyph after another left-to-right.
 * Convert logical Unicode to visual order while keeping European numbers
 * and CAD identifiers intact.
 */
export function cadShxVisualLine(logical: string): string {
  if (!HEBREW.test(logical)) return logical;
  const flipped = [...logical].reverse().join('');
  return flipped.replace(LTR_ATOM, (atom) => [...atom].reverse().join(''));
}

function isolateCadLtrAtoms(text: string): string {
  return text.replace(LTR_ATOM, (atom) => `${LRO}${atom}${PDF}`);
}

/**
 * Canvas fillText applies Unicode bidi. Keep logical order (do not reverse
 * the DWG string) and force LTR embedding plus LRO around numbers so `1.5`
 * cannot render as `5.1`.
 */
export function cadCanvasTextLine(logical: string): string {
  if (!HEBREW.test(logical)) return logical;
  return `${LRE}${isolateCadLtrAtoms(logical)}${PDF}`;
}
