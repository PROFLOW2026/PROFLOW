'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';
import type { ProjectCreateTeamPickerOption } from '@/modules/projects/domain/project-create-team';

export interface ProjectCreateTeamPickerProps {
  readonly options: readonly ProjectCreateTeamPickerOption[];
  readonly projectManagerKey: string | null;
  readonly participantKeys: readonly string[];
  readonly onProjectManagerChange: (key: string | null) => void;
  readonly onParticipantsChange: (keys: string[]) => void;
  readonly disabled?: boolean;
}

function filterOptions(
  options: readonly ProjectCreateTeamPickerOption[],
  query: string,
): ProjectCreateTeamPickerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((option) => {
    const haystack = `${option.displayName} ${option.jobTitle ?? ''}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function ProjectCreateTeamPicker({
  options,
  projectManagerKey,
  participantKeys,
  onProjectManagerChange,
  onParticipantsChange,
  disabled = false,
}: ProjectCreateTeamPickerProps) {
  const t = useTranslations('projects.create.team');
  const [pmQuery, setPmQuery] = useState('');
  const [participantQuery, setParticipantQuery] = useState('');

  const participantSet = useMemo(() => new Set(participantKeys), [participantKeys]);
  const participantOptions = useMemo(
    () => options.filter((option) => option.key !== projectManagerKey),
    [options, projectManagerKey],
  );

  const pmFiltered = useMemo(
    () => filterOptions(options, pmQuery),
    [options, pmQuery],
  );
  const participantFiltered = useMemo(
    () => filterOptions(participantOptions, participantQuery),
    [participantOptions, participantQuery],
  );

  const selectedPm = options.find((option) => option.key === projectManagerKey) ?? null;
  const selectedParticipants = participantOptions.filter((option) => participantSet.has(option.key));

  const toggleParticipant = (key: string) => {
    if (disabled) return;
    onParticipantsChange(
      participantSet.has(key)
        ? participantKeys.filter((value) => value !== key)
        : [...participantKeys, key],
    );
  };

  const selectProjectManager = (key: string) => {
    if (disabled) return;
    onProjectManagerChange(key);
    if (participantSet.has(key)) {
      onParticipantsChange(participantKeys.filter((value) => value !== key));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="projectManagerKey" value={projectManagerKey ?? ''} />
      <input type="hidden" name="participantKeys" value={JSON.stringify(participantKeys)} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('pmLabel')}</p>
          {selectedPm ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onProjectManagerChange(null)}
            >
              {t('clearPm')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('pmHint')}</p>

        {selectedPm ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)] px-2.5 py-1 text-xs font-medium text-[var(--pf-teal-800)]">
            {selectedPm.displayName}
            {selectedPm.jobTitle ? (
              <span className="text-[var(--pf-teal-700)]">· {selectedPm.jobTitle}</span>
            ) : null}
          </span>
        ) : (
          <>
            <input
              type="search"
              value={pmQuery}
              onChange={(event) => setPmQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              disabled={disabled || options.length === 0}
              className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
            />
            <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--pf-border-default)]">
              {options.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--pf-text-muted)]">{t('noCandidates')}</p>
              ) : pmFiltered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--pf-text-muted)]">{t('noMatches')}</p>
              ) : (
                pmFiltered.map((option) => (
                  <button
                    key={`pm-${option.key}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectProjectManager(option.key)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-[var(--pf-bg-muted)]"
                  >
                    <span>
                      {option.displayName}
                      {option.jobTitle ? (
                        <span className="ms-1 text-[var(--pf-text-muted)]">· {option.jobTitle}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-[var(--pf-text-muted)]">
                      {option.kind === 'employee' ? t('employeeBadge') : t('orgMemberBadge')}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('participantsLabel')}</p>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('participantsHint')}</p>

        <input
          type="search"
          value={participantQuery}
          onChange={(event) => setParticipantQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          disabled={disabled || participantOptions.length === 0}
          className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
        />

        {selectedParticipants.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label={t('participantsLabel')}>
            {selectedParticipants.map((option) => (
              <span
                key={option.key}
                role="listitem"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)] px-2.5 py-1 text-xs font-medium text-[var(--pf-teal-800)]"
              >
                {option.displayName}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('remove', { name: option.displayName })}
                  onClick={() => toggleParticipant(option.key)}
                  className="rounded-full p-0.5 hover:bg-[var(--pf-teal-100)]"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('participantsEmpty')}</p>
        )}

        <div
          className="max-h-44 overflow-y-auto rounded-md border border-[var(--pf-border-default)]"
          role="listbox"
          aria-label={t('optionsLabel')}
        >
          {participantOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--pf-text-muted)]">{t('noCandidates')}</p>
          ) : participantFiltered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--pf-text-muted)]">{t('noMatches')}</p>
          ) : (
            participantFiltered.map((option) => {
              const selected = participantSet.has(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => toggleParticipant(option.key)}
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
                    <span className="text-xs font-medium text-[var(--pf-teal-800)]">{t('selected')}</span>
                  ) : (
                    <span className="text-xs text-[var(--pf-text-muted)]">
                      {option.kind === 'employee' ? t('employeeBadge') : t('orgMemberBadge')}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
