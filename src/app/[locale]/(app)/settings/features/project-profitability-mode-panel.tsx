'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PROJECT_PROFITABILITY_MODES,
  type ProjectProfitabilityMode,
} from '@/modules/tenancy/domain/project-profitability-mode';
import { setProjectProfitabilityModeAction, type SettingsActionState } from '../actions';

export function ProjectProfitabilityModePanel({
  initialMode,
  canEdit,
}: {
  initialMode: ProjectProfitabilityMode;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.projectProfitabilityMode');
  const tCommon = useTranslations('common');
  const [mode, setMode] = useState<ProjectProfitabilityMode>(initialMode);
  const [state, action, pending] = useActionState(
    setProjectProfitabilityModeAction,
    {} as SettingsActionState,
  );

  const hintKey =
    mode === 'include_general'
      ? 'hintIncludeGeneral'
      : mode === 'both'
        ? 'hintBoth'
        : 'hintDirect';

  return (
    <form action={action} className="flex flex-col gap-3 border-b border-[var(--pf-border-default)] pb-5">
      <div className="min-w-0">
        <p className="text-start font-medium">{t('title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      <Field label={t('label')} className="min-w-0 sm:max-w-sm">
        {(control) => (
          <>
            <input type="hidden" name="projectProfitabilityMode" value={mode} />
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as ProjectProfitabilityMode)}
              disabled={!canEdit}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_PROFITABILITY_MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t(hintKey)}</p>

      {canEdit ? (
        <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
          {tCommon('actions.save')}
        </Button>
      ) : null}

      {state.error ? (
        <Alert tone="danger" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" className="w-full" role="status" aria-live="polite">
          {t('saved')}
        </Alert>
      ) : null}
    </form>
  );
}
