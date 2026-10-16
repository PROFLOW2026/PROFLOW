/** English-only labels for Model / Layout spaces (never UI-locale translated). */

export const CAD_SPACE_SELECTOR_ARIA = 'Model or layout';

/** e.g. *Model_Space → Model, *Paper_Space0 → Layout 0 */
export function legacyCadSpaceLabel(space: string): string {
  return space.replace(/^\*Paper_Space/i, 'Layout ').replace(/^\*Model_Space/i, 'Model');
}

export function formatCadSpaceLabel(space: string): string {
  return legacyCadSpaceLabel(space);
}

export function cadSpaceSelectorAriaLabel(): string {
  return CAD_SPACE_SELECTOR_ARIA;
}
