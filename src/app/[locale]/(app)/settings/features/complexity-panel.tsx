'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EXPERIENCE_COMPLEXITY_KEYS,
  type ExperienceComplexityKey,
} from '@/modules/tenancy/domain/experience-complexity';
import { saveComplexityAction, type SettingsActionState } from '../actions';

export function ComplexityPanel({
  initialComplexity,
  canEdit,
}: {
  initialComplexity: ExperienceComplexityKey;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.complexity');
  const tCommon = useTranslations('common');
  const [complexity, setComplexity] = useState<ExperienceComplexityKey>(initialComplexity);
  const [state, action, pending] = useActionState(saveComplexityAction, {} as SettingsActionState);

  return (
    <MainAppSection title={t('title')} description={t('subtitle')} className="w-full min-w-0">
      <form action={action} className="flex w-full min-w-0 flex-col gap-3">
        <MainAppFormGrid dense className="gap-4">
          <Field label={t('label')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <>
                <input type="hidden" name="complexity" value={complexity} />
                <Select
                  value={complexity}
                  onValueChange={(value) => setComplexity(value as ExperienceComplexityKey)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_COMPLEXITY_KEYS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <p className={`${mainAppFieldSpan.full} text-start text-xs text-[var(--pf-text-muted)]`}>
            {t(`hint.${complexity}`)}
          </p>
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
