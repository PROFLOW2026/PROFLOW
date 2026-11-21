const HEBREW = /[\u0590-\u05FF]/;
const DIGIT = /\d/;
/** Cable marks, decimals and multipliers stay LTR even inside a Hebrew line. */
const LTR_ATOM = /[A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?(?:[xX×]\d+(?:\.\d+)?)*/g;
const LRE = '\u202A';
const LRO = '\u202D';
const PDF = '\u202C';
const LRI = '\u2066';
const PDI = '\u2069';
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function stripBidiMarks(text: string): string {
  return text.replace(BIDI_MARKS, '');
}

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

function isolateCadLtrAtoms(text: string): string {
  return text.replace(LTR_ATOM, (atom) => `${LRO}${atom}${PDF}`);
}

function isolateHtmlLtrAtoms(text: string): string {
  return text.replace(LTR_ATOM, (atom) => `${LRI}${atom}${PDI}`);
}

/**
 * SHX and canvas-LTR draw one glyph after another left-to-right.
 * Convert logical Unicode to visual order while keeping European numbers
 * and CAD identifiers intact. Digit characters are not rewritten.
 */
export function cadShxVisualLine(logical: string): string {
  const source = stripBidiMarks(logical);
  if (!HEBREW.test(source)) return source;
  const flipped = [...source].reverse().join('');
  return flipped.replace(LTR_ATOM, (atom) => [...atom].reverse().join(''));
}

/**
 * Canvas fillText applies Unicode bidi. Keep the source characters (do not
 * reverse the DWG string or guess number values) and force LTR embedding plus
 * LRO around numbers so a stored `1.5` cannot render as `5.1`.
 */
export function cadCanvasTextLine(logical: string): string {
  const source = stripBidiMarks(logical);
  if (!HEBREW.test(source)) return source;
  return `${LRE}${isolateCadLtrAtoms(source)}${PDF}`;
}

/**
 * HTML / BOQ in an RTL page. Isolate LTR atoms so the browser cannot flip a
 * stored `1.5`. Hebrew word order and stored digits (`5.1`, `02`) stay as-is.
 */
export function cadHtmlTextLine(logical: string): string {
  const source = stripBidiMarks(logical);
  if (!HEBREW.test(source)) return source;
  return isolateHtmlLtrAtoms(source);
}
