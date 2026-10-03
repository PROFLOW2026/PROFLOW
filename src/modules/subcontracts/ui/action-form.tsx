'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { inputClassName } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';
import { INITIAL_FORM_STATE, type SubcontractFormState } from './form-state';

export type SubcontractAction = (prev: SubcontractFormState, formData: FormData) => Promise<SubcontractFormState>;

const FieldErrorsContext = React.createContext<Record<string, string> | undefined>(undefined);

/** Minimal server-action form: hidden fields, inline errors, pending-safe submit. */
export function ActionForm({
  action,
  hidden,
  submitLabel,
  successLabel,
  submitVariant = 'primary',
  className,
  children,
  resetOnSuccess = false,
}: {
  action: SubcontractAction;
  hidden?: Record<string, string | null | undefined>;
  submitLabel: string;
  successLabel?: string;
  submitVariant?: ButtonProps['variant'];
  className?: string;
  children?: React.ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FORM_STATE);
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={cn('flex flex-col gap-3', className)}>
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value == null ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      <FieldErrorsContext.Provider value={state.fieldErrors}>{children}</FieldErrorsContext.Provider>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-[var(--pf-status-danger-fg)]">
          {state.error}
        </p>
      ) : null}
      {state.success && successLabel ? (
        <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">
          {successLabel}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant={submitVariant} size="sm" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Labeled native control (works with FormData without client state). */
export function FormField({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  placeholder,
  inputMode,
  options,
  multiline,
  className,
}: {
  label: string;
  name: string;
  type?: 'text' | 'date' | 'number';
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  options?: readonly { value: string; label: string }[];
  multiline?: boolean;
  className?: string;
}) {
  const errors = React.useContext(FieldErrorsContext);
  const error = errors?.[name];
  const id = React.useId();
  const common = {
    id,
    name,
    required,
    'aria-invalid': error ? true : undefined,
    defaultValue: defaultValue ?? undefined,
  } as const;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="ms-1 text-[var(--pf-action-danger)]" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {options ? (
        <select {...common} className={inputClassName}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea {...common} rows={3} placeholder={placeholder} className={cn(inputClassName, 'h-auto py-2')} />
      ) : (
        <input
          {...common}
          type={type === 'number' ? 'text' : type}
          inputMode={type === 'number' ? (inputMode ?? 'decimal') : inputMode}
          placeholder={placeholder}
          dir={type === 'number' || type === 'date' ? 'ltr' : undefined}
          className={inputClassName}
        />
      )}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--pf-status-danger-fg)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
