'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROFESSION_PRESET_KEYS } from '@/modules/tenancy/domain/profession-presets';
import { applyProfessionPresetAction, type SettingsActionState } from '../actions';

export function ProfessionPresetForm({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.presets');
  const tAuth = useTranslations('auth.onboarding');
  const [preset, setPreset] = useState<string>(PROFESSION_PRESET_KEYS[0]!);
  const [state, action, pending] = useActionState(
    applyProfessionPresetAction,
    {} as SettingsActionState,
  );

  if (!canEdit) return null;

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
      <div>
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('label')}>
        {(control) => (
          <>
            <input type="hidden" name="professionPreset" value={preset} />
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFESSION_PRESET_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {tAuth(`presets.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Button type="submit" loading={pending} variant="secondary">
        {t('apply')}
      </Button>
    </form>
  );
}
