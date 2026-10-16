'use client';

import { Button } from '@/components/ui/button';

export type CadViewerVersion = 'v1' | 'v2';

export const DEFAULT_CAD_VIEWER_VERSION: CadViewerVersion = 'v1';

const OPTIONS: readonly { id: CadViewerVersion; label: string }[] = [
  { id: 'v1', label: 'גרסה 1' },
  { id: 'v2', label: 'גרסה 2' },
];

/** Compact two-way switch. Does not load or render a CAD engine. */
export function CadViewerVersionSelect({
  value,
  onChange,
}: {
  value: CadViewerVersion;
  onChange: (version: CadViewerVersion) => void;
}) {
  return (
    <div role="group" aria-label="גרסת מציג" className="inline-flex shrink-0 items-center gap-1">
      {OPTIONS.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={value === option.id ? 'primary' : 'secondary'}
          className="h-9 min-h-9 whitespace-nowrap px-2 text-xs font-medium"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
