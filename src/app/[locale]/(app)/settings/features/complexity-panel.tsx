'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
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
    <form
      action={action}
      className="flex flex-col gap-3 border-b border-[var(--pf-border-default)] pb-5"
    >
      <div className="min-w-0">
        <p className="text-start font-medium">{t('title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      <Field label={t('label')} className="min-w-0 sm:max-w-sm">
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

      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t(`hint.${complexity}`)}</p>

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
