'use client';

import { captureLevelChoices } from '../domain/location-scope';
import type { InfraLocationOption } from '../domain/types';
import { INFRA_TEXT } from './texts';

/**
 * Level picker for a multi-level unit (or a room inside one). Renders nothing for every other location, so the
 * ordinary flow gets no extra field. Without a level the location tree decides (as for older captures).
 */
export function InfraLevelSelect({
  locations,
  locationId,
  value,
  onChange,
  testId,
  emptyLabel,
}: {
  readonly locations: readonly InfraLocationOption[];
  readonly locationId: string | null;
  readonly value: string | null;
  readonly onChange: (levelId: string | null) => void;
  readonly testId?: string;
  /** Adds an explicit "no level" option (editing an older capture). */
  readonly emptyLabel?: string;
}) {
  const choices = captureLevelChoices(locations, locationId);
  if (choices.length === 0) return null;
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{INFRA_TEXT.capture.level}</span>
      <select
        className="min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-3 text-sm"
        value={value ?? (emptyLabel ? '' : (choices[0]?.id ?? ''))}
        onChange={(event) => onChange(event.target.value || null)}
        data-testid={testId}
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
}
