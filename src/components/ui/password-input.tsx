'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import { Input, inputClassName, type InputProps } from './input';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  /** Stable id for the toggle (a11y). Defaults to `${id}-toggle` when `id` is set. */
  toggleId?: string;
}

/**
 * Password field with an accessible show/hide control.
 * Visibility toggles do not clear or rewrite the value.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, toggleId, id, disabled, ...props }, ref) {
    const t = useTranslations('auth.password');
    const [visible, setVisible] = React.useState(false);
    const resolvedToggleId = toggleId ?? (id ? `${id}-toggle` : undefined);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          dir="ltr"
          autoComplete={props.autoComplete ?? 'new-password'}
          className={cn('pe-11', className)}
        />
        <button
          id={resolvedToggleId}
          type="button"
          tabIndex={0}
          disabled={disabled}
          className={cn(
            'absolute inset-y-0 end-0 flex min-h-11 min-w-11 items-center justify-center rounded-e-md',
            'text-[var(--pf-text-secondary)] transition-colors',
            'hover:text-[var(--pf-text-primary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pf-focus-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-label={visible ? t('hide') : t('show')}
          aria-pressed={visible}
          title={visible ? t('hide') : t('show')}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    );
  },
);

/** Exported for tests / story reuse of the same padding contract. */
export const passwordInputShellClassName = inputClassName;
