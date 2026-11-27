'use client';

import { useState } from 'react';
import type { DesignRouteFamily } from '../route-family';

const FAMILY_LABEL: Record<DesignRouteFamily, string> = {
  'dev-harness': '',
  'public-auth': '',
  'public-live': '',
  'home-dual': 'לוח',
  engine: '',
  print: '',
  settings: 'הגדרות',
  finance: 'כספים',
  'surface-home': 'היום',
  'project-home': 'פרויקט',
  form: 'טופס',
  detail: 'פירוט',
  list: 'רשימה',
};

/**
 * Structural chrome for one family. Rendered after the page body so the body
 * stays the first child and a design switch does not remount fields or filters.
 * It does not invent money, tasks, or navigation.
 */
export function DesignFamilyChrome({
  family,
  design,
}: {
  family: DesignRouteFamily;
  design: 'v9' | 'v10';
}) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const label = FAMILY_LABEL[family];
  if (!label) return null;

  if (design === 'v9') {
    return (
      <header data-pf-design-landmark="v9-family" className="pf-design-family-band pf-design-finance-chrome">
        <p className="pf-design-kicker">{label}</p>
        {family === 'list' ? <p data-pf-design-landmark="v9-table-note">טבלה מלאה. אין קיפול עמודות.</p> : null}
      </header>
    );
  }

  return (
    <div data-pf-design-landmark="v10-family" className="pf-design-family-band pf-design-finance-chrome">
      <p className="pf-design-kicker">{label}</p>
      {family === 'detail' || family === 'list' || family === 'project-home' ? (
        <>
          <button
            type="button"
            className="pf-design-fold-toggle"
            aria-expanded={secondaryOpen}
            onClick={() => setSecondaryOpen((open) => !open)}
          >
            {secondaryOpen ? 'הסתר פירוט משני' : 'פירוט משני'}
          </button>
          {secondaryOpen ? (
            <p data-pf-design-landmark="v10-secondary">
              הפירוט המשני פתוח. הפעולות הראשיות נשארות במסך.
            </p>
          ) : (
            <p data-pf-design-landmark="v10-secondary" hidden>
              פירוט משני סגור
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
