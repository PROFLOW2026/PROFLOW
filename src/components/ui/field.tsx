'use client';

import * as React from 'react';
import { cn } from '@/shared/ui/cn';
import { Label } from './label';

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

type FieldControlProps = {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
};

export interface FieldProps {
  label: React.ReactNode;
  /**
   * Optional stable control id. Prefer this on auth / e2e-critical forms so
   * SSR→client `useId()` remounts do not wipe filled values mid-interaction.
   */
  id?: string;
  /** Only genuinely required fields are marked — see the contextual matrix in doc 48. */
  required?: boolean;
  optionalLabel?: string;
  description?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: (controlProps: FieldControlProps) => React.ReactNode;
}

export function Field({
  label,
  id,
  required = false,
  optionalLabel,
  description,
  error,
  className,
  children,
}: FieldProps) {
  const reactId = React.useId();
  const controlId = id?.trim() || `${reactId}-control`;
  const value = React.useMemo<FieldContextValue>(
    () => ({
      id: controlId,
      descriptionId: `${controlId}-description`,
      errorId: `${controlId}-error`,
      hasError: Boolean(error),
    }),
    [controlId, error],
  );

  const controlProps = {
    id: value.id,
    'aria-invalid': value.hasError || undefined,
    'aria-describedby':
      [value.hasError ? value.errorId : null, description ? value.descriptionId : null]
        .filter(Boolean)
        .join(' ') || undefined,
  } as const;

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={value.id}>
            {label}
            {required ? (
              <span className="ms-1 text-[var(--pf-action-danger)]" aria-hidden>
                *
              </span>
            ) : null}
          </Label>
          {!required && optionalLabel ? (
            <span className="text-xs text-[var(--pf-text-muted)]">{optionalLabel}</span>
          ) : null}
        </div>

        {children(controlProps)}

        {description ? (
          <p id={value.descriptionId} className="text-xs text-[var(--pf-text-muted)]">
            {description}
          </p>
        ) : null}

        {error ? (
          <p
            id={value.errorId}
            role="alert"
            className="text-xs font-medium text-[var(--pf-status-danger-fg)]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
