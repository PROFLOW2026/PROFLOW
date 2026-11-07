'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';

/**
 * Whole-number quantity field for the structure wizard.
 *
 * What the user types is a text DRAFT, not a number: it can be emptied, selected and replaced, and a
 * leading 0 never sticks ("05" becomes "5"). A valid draft is committed on every keystroke; an empty or
 * too-small one is only normalized when the field loses focus (or the wizard moves on), never forced on
 * each keystroke. Negative signs, letters and decimals are dropped as they are typed.
 */

/** Keeps digits only (no sign, no decimals), no leading zeros, at most `maxDigits` digits. '' stays ''. */
export function sanitizeCountDraft(raw: string, maxDigits = 4): string {
  const digits = raw.replace(/\D/g, '').slice(0, maxDigits);
  return digits === '' ? '' : String(Number(digits));
}

/**
 * The number a draft stands for. While typing, an empty or below-minimum draft yields `null` (nothing is
 * committed yet); on blur (`final`) it is normalized to `min`. Above `max` is always clamped.
 */
export function resolveCountDraft(draft: string, min: number, max: number, final: boolean): number | null {
  if (draft === '') return final ? min : null;
  const value = Number(draft);
  if (!Number.isFinite(value)) return final ? min : null;
  if (value < min) return final ? min : null;
  return Math.min(value, max);
}

export function CountField({
  label,
  value,
  min = 0,
  max,
  onChange,
  id,
  hint,
  className,
  inputClassName,
  'aria-label': ariaLabel,
}: {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly id?: string;
  /** Shown next to the field while it is empty or below its minimum (what is required). */
  readonly hint?: string;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly 'aria-label'?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  // null = not being edited: show the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const incomplete = draft !== null && resolveCountDraft(draft, min, max, false) === null;

  const input = (
    <Input
      id={fieldId}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      enterKeyHint="next"
      aria-label={label ? undefined : ariaLabel}
      aria-invalid={incomplete && min > 0 ? true : undefined}
      aria-describedby={hint ? hintId : undefined}
      className={inputClassName}
      value={shown}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = sanitizeCountDraft(event.target.value);
        const resolved = resolveCountDraft(next, min, max, false);
        // Above max: show the clamped number right away instead of silently keeping a bigger one.
        setDraft(next !== '' && Number(next) > max ? String(max) : next);
        if (resolved !== null && resolved !== value) onChange(resolved);
      }}
      onBlur={() => {
        if (draft !== null) {
          const resolved = resolveCountDraft(draft, min, max, true);
          if (resolved !== null && resolved !== value) onChange(resolved);
        }
        setDraft(null);
      }}
    />
  );

  return (
    <div className={cn('flex min-w-0 flex-col gap-1 text-sm', className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-[var(--pf-text-secondary)]">
          {label}
        </label>
      ) : null}
      {input}
      {hint && incomplete && min > 0 ? (
        <span id={hintId} role="alert" className="text-xs text-[var(--pf-text-danger)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
