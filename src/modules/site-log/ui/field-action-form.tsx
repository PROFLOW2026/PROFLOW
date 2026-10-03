'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';

export interface FieldFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  readonly nonce?: number;
}

export type FieldFormAction = (state: FieldFormState, formData: FormData) => Promise<FieldFormState>;

/**
 * Server-action form used by every Track O screen: hidden fields, inline error, pending state and
 * reset after a successful submit.
 */
export function FieldActionForm({
  action,
  hidden,
  submitLabel,
  children,
  variant = 'primary',
  size = 'md',
  className,
  resetOnSuccess = true,
  successMessage,
  confirmMessage,
  block = false,
}: {
  readonly action: FieldFormAction;
  readonly hidden?: Readonly<Record<string, string | null | undefined>>;
  readonly submitLabel: string;
  readonly children?: ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';
  readonly size?: 'sm' | 'md';
  readonly className?: string;
  readonly resetOnSuccess?: boolean;
  readonly successMessage?: string;
  readonly confirmMessage?: string;
  readonly block?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state.nonce, state.success, resetOnSuccess]);

  const fieldErrors = state.fieldErrors ? Object.values(state.fieldErrors) : [];

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn('flex min-w-0 flex-col gap-3', className)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value === null || value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      {children}
      {state.error ? (
        <Alert tone="danger">
          <span>{state.error}</span>
          {fieldErrors.length > 0 ? (
            <ul className="mt-1 list-disc ps-5 text-xs">
              {fieldErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {state.success && successMessage ? <Alert tone="success">{successMessage}</Alert> : null}
      <div>
        <Button type="submit" variant={variant} size={size} disabled={pending} loading={pending} block={block}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export const fieldSelectClassName =
  'block min-h-11 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm text-start text-[var(--pf-text-primary)] focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-[var(--pf-focus-ring)]';

export function FieldLabel({ label, children, hint }: { readonly label: string; readonly children: ReactNode; readonly hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--pf-text-primary)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--pf-text-muted)]">{hint}</span> : null}
    </label>
  );
}
