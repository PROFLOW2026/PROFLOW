'use client';

import { useTranslations } from 'next-intl';
import type { ExpenseVatMode } from '../domain/vat-mode';
import { cn } from '@/shared/ui/cn';

export function ExpenseVatModeSelector({
  value,
  onChange,
  disabled = false,
  name = 'vatMode',
  controlId,
  describedBy,
}: {
  readonly value: ExpenseVatMode;
  readonly onChange: (mode: ExpenseVatMode) => void;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly controlId?: string;
  readonly describedBy?: string;
}) {
  const t = useTranslations('expenses');

  const options: readonly { readonly id: ExpenseVatMode; readonly label: string }[] = [
    { id: 'inclusive', label: t('fields.amountIncludingTax') },
    { id: 'exclusive', label: t('fields.amountExcludingTax') },
    { id: 'zero', label: t('fields.amountZeroTax') },
  ];

  return (
    <div
      id={controlId}
      aria-describedby={describedBy}
      role="radiogroup"
      aria-label={t('fields.amountTaxMode')}
      className="flex flex-wrap gap-2"
    >
      <input type="hidden" name={name} value={value} />
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm transition-colors',
              selected
                ? 'border-[var(--pf-border-focus)] bg-[var(--pf-action-subtle-hover)] text-[var(--pf-text-primary)]'
                : 'border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
