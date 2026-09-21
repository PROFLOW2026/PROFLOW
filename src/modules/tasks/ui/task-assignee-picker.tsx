'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { cn } from '@/shared/ui/cn';

export interface TaskAssigneePickerOption {
  readonly key: string;
  readonly displayName: string;
  readonly jobTitle?: string | null;
}

export interface TaskAssigneePickerProps {
  readonly options: readonly TaskAssigneePickerOption[];
  readonly selectedKeys: readonly string[];
  readonly onChange: (keys: string[]) => void;
  readonly disabled?: boolean;
  readonly allowWholeTeam?: boolean;
  readonly wholeTeamSelected?: boolean;
  readonly onWholeTeamChange?: (selected: boolean) => void;
  readonly id?: string;
}

export function TaskAssigneePicker({
  options,
  selectedKeys,
  onChange,
  disabled = false,
  allowWholeTeam = false,
  wholeTeamSelected = false,
  onWholeTeamChange,
  id = 'task-assignee-picker',
}: TaskAssigneePickerProps) {
  const t = useTranslations('tasks');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const haystack = `${option.displayName} ${option.jobTitle ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleKey = (key: string) => {
    if (disabled || wholeTeamSelected) return;
    onChange(
      selectedSet.has(key)
        ? selectedKeys.filter((value) => value !== key)
        : [...selectedKeys, key],
    );
  };

  const selectedOptions = options.filter((option) => selectedSet.has(option.key));

  return (
    <div className="flex flex-col gap-2">
      {allowWholeTeam && onWholeTeamChange ? (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={wholeTeamSelected}
          onClick={() => {
            const next = !wholeTeamSelected;
            onWholeTeamChange(next);
            if (next) onChange([]);
          }}
          className={cn(
            'inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            wholeTeamSelected
              ? 'border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)] text-[var(--pf-teal-800)]'
              : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-strong)]',
          )}
        >
          {t('assigneePicker.wholeTeam')}
        </button>
      ) : null}

      {wholeTeamSelected ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('assigneePicker.wholeTeamHint')}</p>
      ) : (
        <>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('assigneePicker.searchPlaceholder')}
            disabled={disabled}
            className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
          />

          {selectedOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="list" aria-label={t('assigneesLabel')}>
              {selectedOptions.map((option) => (
                <span
                  key={option.key}
                  role="listitem"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)] px-2.5 py-1 text-xs font-medium text-[var(--pf-teal-800)]"
                >
                  {option.displayName}
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t('assigneePicker.remove', { name: option.displayName })}
                    onClick={() => toggleKey(option.key)}
                    className="rounded-full p-0.5 hover:bg-[var(--pf-teal-100)]"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('unassigned')}</p>
          )}

          <div
            className="max-h-44 overflow-y-auto rounded-md border border-[var(--pf-border-default)]"
            role="listbox"
            aria-label={t('assigneePicker.optionsLabel')}
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--pf-text-muted)]">
                {t('assigneePicker.noMatches')}
              </p>
            ) : (
              filtered.map((option) => {
                const selected = selectedSet.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    onClick={() => toggleKey(option.key)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-[var(--pf-bg-muted)]',
                      selected && 'bg-[var(--pf-teal-50)]',
                    )}
                  >
                    <span>
                      {option.displayName}
                      {option.jobTitle ? (
                        <span className="ms-1 text-[var(--pf-text-muted)]">· {option.jobTitle}</span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span className="text-xs font-medium text-[var(--pf-teal-800)]">
                        {t('assigneePicker.selected')}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
