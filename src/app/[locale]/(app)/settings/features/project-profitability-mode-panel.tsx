'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
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
    <MainAppSection title={t('title')} description={t('subtitle')} className="w-full min-w-0">
      <form action={action} className="flex w-full min-w-0 flex-col gap-3">
        <MainAppFormGrid dense className="gap-4">
          <Field label={t('label')} className={mainAppFieldSpan.lg}>
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
          <p className={`${mainAppFieldSpan.full} text-start text-xs text-[var(--pf-text-muted)]`}>{t(hintKey)}</p>
          {canEdit ? (
            <div className={mainAppFieldSpan.full}>
              <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
                {tCommon('actions.save')}
              </Button>
            </div>
          ) : null}
          {state.error ? (
            <Alert tone="danger" className={`${mainAppFieldSpan.full} w-full`}>
              {state.error}
            </Alert>
          ) : null}
          {state.ok ? (
            <Alert tone="success" className={`${mainAppFieldSpan.full} w-full`} role="status" aria-live="polite">
              {t('saved')}
            </Alert>
          ) : null}
        </MainAppFormGrid>
      </form>
    </MainAppSection>
  );
}
