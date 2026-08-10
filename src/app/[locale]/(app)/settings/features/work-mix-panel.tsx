'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WORK_MIXES, type WorkMix } from '@/modules/tenancy/domain/work-mix';
import { setWorkMixAction, type SettingsActionState } from '../actions';

export function WorkMixPanel({
  initialWorkMix,
  canEdit,
}: {
  initialWorkMix: WorkMix;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.workMix');
  const tCommon = useTranslations('common');
  const [workMix, setWorkMix] = useState<WorkMix>(initialWorkMix);
  const [state, action, pending] = useActionState(setWorkMixAction, {} as SettingsActionState);

  const hintKey =
    workMix === 'jobs' ? 'hintJobs' : workMix === 'mixed' ? 'hintMixed' : 'hintProjects';

  return (
    <form action={action} className="flex flex-col gap-3 border-b border-[var(--pf-border-default)] pb-5">
      <div className="min-w-0">
        <p className="text-start font-medium">{t('title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      <Field label={t('label')} className="min-w-0 sm:max-w-sm">
        {(control) => (
          <>
            <input type="hidden" name="workMix" value={workMix} />
            <Select
              value={workMix}
              onValueChange={(value) => setWorkMix(value as WorkMix)}
              disabled={!canEdit}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_MIXES.map((value) => (
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
