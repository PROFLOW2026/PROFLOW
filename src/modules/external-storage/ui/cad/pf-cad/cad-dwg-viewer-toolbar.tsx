'use client';

import { CadDwgCompactAlerts } from './cad-dwg-compact-alerts';
import { CadDwgSpaceSelect } from './cad-dwg-space-select';
import type { CadDwgBanner } from './cad-ui-messages';

/** Model/Layout selector (right) + compact warnings (left) on one row. */
export function CadDwgViewerToolbar({
  spaces,
  activeSpace,
  onSpaceChange,
  banners,
  locale,
}: {
  spaces: readonly string[];
  activeSpace: string;
  onSpaceChange: (space: string) => void;
  banners: readonly CadDwgBanner[];
  locale: string;
}) {
  const showSpace = spaces.length > 1;

  return (
    <div
      dir="ltr"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2 py-1.5 sm:gap-3"
    >
      <div className="pointer-events-auto min-w-0 justify-self-start pt-0.5">
        <CadDwgCompactAlerts banners={banners} locale={locale} />
      </div>
      {showSpace ? (
        <div className="pointer-events-auto justify-self-end">
          <CadDwgSpaceSelect
            spaces={spaces}
            value={activeSpace}
            onValueChange={onSpaceChange}
            triggerClassName="h-9 min-h-9 w-auto min-w-[7.5rem] max-w-[min(100vw-8rem,14rem)] sm:max-w-xs"
          />
        </div>
      ) : null}
    </div>
  );
}
