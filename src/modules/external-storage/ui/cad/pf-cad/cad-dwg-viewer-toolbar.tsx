'use client';

import { Button } from '@/components/ui/button';
import { CadDwgCompactAlerts } from './cad-dwg-compact-alerts';
import { CadDwgSpaceSelect } from './cad-dwg-space-select';
import type { CadDwgBanner } from './cad-ui-messages';
import { cadPlotViewLabel } from './cad-ui-messages';
import {
  CadViewerVersionSelect,
  type CadViewerVersion,
} from '../cad-viewer-version-select';

/** Model/Layout selector (right) + compact warnings (left) on one row. */
export function CadDwgViewerToolbar({
  spaces,
  activeSpace,
  onSpaceChange,
  banners,
  locale,
  plotView,
  onPlotViewChange,
  viewerVersion,
  onViewerVersionChange,
}: {
  spaces: readonly string[];
  activeSpace: string;
  onSpaceChange: (space: string) => void;
  banners: readonly CadDwgBanner[];
  locale: string;
  plotView: boolean;
  onPlotViewChange: (on: boolean) => void;
  viewerVersion?: CadViewerVersion;
  onViewerVersionChange?: (version: CadViewerVersion) => void;
}) {
  const showSpace = spaces.length > 1;
  const visibleBanners = banners.filter((banner) => banner.key !== 'cadDwgFontsMissing');

  return (
    <div
      dir="ltr"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-1.5 px-1.5 py-1.5 sm:items-start sm:gap-3 sm:px-2"
    >
      <div className="pointer-events-auto flex min-w-0 max-w-[30%] items-center justify-self-start gap-1 sm:max-w-none">
        <CadDwgCompactAlerts banners={visibleBanners} locale={locale} />
      </div>
      {/*
        Mobile: single nowrap row (Model was wrapping to a second line).
        sm+: keep prior spacing; nowrap is fine on desktop width.
      */}
      <div
        data-testid="cad-dwg-toolbar-controls"
        className="pointer-events-auto flex min-w-0 max-w-full flex-nowrap items-center justify-end gap-1 overflow-hidden sm:gap-2"
      >
        {viewerVersion && onViewerVersionChange ? (
          <CadViewerVersionSelect value={viewerVersion} onChange={onViewerVersionChange} />
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={plotView ? 'primary' : 'secondary'}
          className="h-8 min-h-8 shrink-0 px-1.5 text-[11px] font-medium sm:h-9 sm:min-h-9 sm:px-2.5 sm:text-xs"
          onClick={() => onPlotViewChange(!plotView)}
        >
          <span dir="auto" className="max-w-[4.5rem] truncate sm:max-w-none">
            {cadPlotViewLabel(locale)}
          </span>
        </Button>
        {showSpace ? (
          <CadDwgSpaceSelect
            spaces={spaces}
            value={activeSpace}
            onValueChange={onSpaceChange}
            triggerClassName="h-8 min-h-8 min-w-0 w-auto flex-1 basis-[6.5rem] max-w-[min(42vw,9.5rem)] truncate sm:h-9 sm:min-h-9 sm:min-w-[7.5rem] sm:max-w-xs sm:flex-none sm:basis-auto"
          />
        ) : null}
      </div>
    </div>
  );
}
