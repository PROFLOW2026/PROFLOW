/** Human-readable Model / Layout labels for DWG paper & model spaces. */

export type CadSpacePreviewTranslator = ((
  key: 'cadSpaceModel' | 'cadSpaceLayout' | 'cadSpaceSelector',
  values?: { name: string },
) => string) & {
  has?: (key: string) => boolean;
};

const FALLBACK_SELECTOR = 'Model or layout';

/** Same display as pre-i18n viewer (safe when catalog keys are stale in dev). */
export function legacyCadSpaceLabel(space: string): string {
  return space.replace(/^\*Paper_Space/i, 'Layout ').replace(/^\*Model_Space/i, 'Model');
}

function safeT(
  t: CadSpacePreviewTranslator,
  key: 'cadSpaceModel' | 'cadSpaceLayout' | 'cadSpaceSelector',
  values?: { name: string },
  legacy?: string,
): string {
  if (typeof t.has === 'function' && !t.has(key)) {
    return legacy ?? FALLBACK_SELECTOR;
  }
  try {
    const value =
      key === 'cadSpaceLayout' && values
        ? t('cadSpaceLayout', values)
        : t(key as 'cadSpaceModel' | 'cadSpaceSelector');
    if (!value || value.includes('MISSING_MESSAGE') || value.startsWith('[missing:')) {
      return legacy ?? FALLBACK_SELECTOR;
    }
    return value;
  } catch {
    return legacy ?? FALLBACK_SELECTOR;
  }
}

export function formatCadSpaceLabel(space: string, t: CadSpacePreviewTranslator): string {
  const legacy = legacyCadSpaceLabel(space);
  if (/^\*Model_Space/i.test(space)) {
    return safeT(t, 'cadSpaceModel', undefined, legacy);
  }
  const paper = space.match(/^\*Paper_Space\s*(.*)$/i);
  if (paper) {
    const name = (paper[1] ?? '').trim() || '0';
    return safeT(t, 'cadSpaceLayout', { name }, legacy);
  }
  return space;
}

export function cadSpaceSelectorAriaLabel(t: CadSpacePreviewTranslator): string {
  return safeT(t, 'cadSpaceSelector', undefined, FALLBACK_SELECTOR);
}
