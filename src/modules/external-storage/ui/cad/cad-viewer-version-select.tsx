'use client';

import { Button } from '@/components/ui/button';

export type CadViewerVersion = 'v1' | 'v2' | 'v3';

export const DEFAULT_CAD_VIEWER_VERSION: CadViewerVersion = 'v1';

const OPTIONS: readonly { id: CadViewerVersion; label: string }[] = [
  { id: 'v1', label: 'גרסה 1' },
  { id: 'v2', label: 'גרסה 2' },
  { id: 'v3', label: 'גרסה 3' },
];

/** Compact version switch. Does not load or render a CAD engine. */
export function CadViewerVersionSelect({
  value,
  onChange,
}: {
  value: CadViewerVersion;
  onChange: (version: CadViewerVersion) => void;
}) {
  return (
    <div
      role="group"
      aria-label="גרסת מציג"
      className="inline-flex shrink-0 items-center gap-0.5 sm:gap-1"
    >
      {OPTIONS.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={value === option.id ? 'primary' : 'secondary'}
          className="h-8 min-h-8 min-w-8 whitespace-nowrap px-1.5 text-[11px] font-medium sm:h-9 sm:min-h-9 sm:min-w-0 sm:px-2 sm:text-xs"
          aria-label={option.label}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {/* Mobile: short digits so Model/Plot stay on one row; desktop keeps full labels. */}
          <span className="sm:hidden">{option.id.slice(1)}</span>
          <span className="hidden sm:inline">{option.label}</span>
        </Button>
      ))}
    </div>
  );
}
