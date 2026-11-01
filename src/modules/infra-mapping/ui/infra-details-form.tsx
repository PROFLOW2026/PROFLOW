'use client';

import { useId } from 'react';
import { INFRA_ROLE_LABELS, INFRA_TYPES, INFRA_TYPE_LABELS, INFRA_CAPTURE_ROLES } from '../domain/types';
import type { QueueDetails } from '../domain/upload-queue';
import { INFRA_TEXT } from './texts';

const fieldClass =
  'min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-3 text-sm disabled:opacity-60';

/** Optional descriptors of a photo. Only the location is mandatory; everything here may be edited later. */
export function InfraDetailsForm({
  value,
  onChange,
  suggestions,
  disabled,
  showRole = true,
}: {
  readonly value: QueueDetails;
  readonly onChange: (patch: Partial<QueueDetails>) => void;
  readonly suggestions?: { readonly rooms: readonly string[]; readonly walls: readonly string[] };
  readonly disabled?: boolean;
  readonly showRole?: boolean;
}) {
  const id = useId();
  const t = INFRA_TEXT.details;
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">{t.description}</span>
        <input
          className={fieldClass}
          value={value.description}
          maxLength={1000}
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
          data-testid="infra-detail-description"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">{t.room}</span>
        <input
          className={fieldClass}
          value={value.room}
          maxLength={120}
          list={`${id}-rooms`}
          disabled={disabled}
          onChange={(event) => onChange({ room: event.target.value })}
          data-testid="infra-detail-room"
        />
        <datalist id={`${id}-rooms`}>
          {(suggestions?.rooms ?? []).map((room) => (
            <option key={room} value={room} />
          ))}
        </datalist>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">{t.wall}</span>
        <input
          className={fieldClass}
          value={value.wall}
          maxLength={120}
          list={`${id}-walls`}
          disabled={disabled}
          onChange={(event) => onChange({ wall: event.target.value })}
          data-testid="infra-detail-wall"
        />
        <datalist id={`${id}-walls`}>
          {(suggestions?.walls ?? []).map((wall) => (
            <option key={wall} value={wall} />
          ))}
        </datalist>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">{t.infraType}</span>
        <select
          className={fieldClass}
          value={value.infraType}
          disabled={disabled}
          onChange={(event) => onChange({ infraType: event.target.value })}
          data-testid="infra-detail-type"
        >
          <option value="">{t.infraTypeNone}</option>
          {INFRA_TYPES.map((type) => (
            <option key={type} value={type}>
              {INFRA_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">{t.dimensions}</span>
        <input
          className={fieldClass}
          value={value.dimensions}
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ dimensions: event.target.value })}
        />
      </label>
      {showRole ? (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium">{t.role}</span>
          <select
            className={fieldClass}
            value={value.role}
            disabled={disabled}
            onChange={(event) => onChange({ role: event.target.value as QueueDetails['role'] })}
          >
            {INFRA_CAPTURE_ROLES.map((role) => (
              <option key={role} value={role}>
                {INFRA_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">{t.note}</span>
        <textarea
          className={`${fieldClass} min-h-20 py-2`}
          value={value.note}
          maxLength={1000}
          rows={2}
          disabled={disabled}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </label>
    </div>
  );
}
