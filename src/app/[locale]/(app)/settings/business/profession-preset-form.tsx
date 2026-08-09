'use client';

import { useActionState, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getProfessionPreset,
  PROFESSION_PRESET_KEYS,
} from '@/modules/tenancy/domain/profession-presets';
import { applyProfessionPresetAction, type SettingsActionState } from '../actions';

export function ProfessionPresetForm({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.presets');
  const tAuth = useTranslations('auth.onboarding');
  const locale = useLocale();
  const [preset, setPreset] = useState<string>(PROFESSION_PRESET_KEYS[0]!);
  const [state, action, pending] = useActionState(
    applyProfessionPresetAction,
    {} as SettingsActionState,
  );

  const preview = useMemo(() => getProfessionPreset(preset), [preset]);
  const he = locale === 'he-IL';

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

      {preview ? (
        <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm text-[var(--pf-text-secondary)]">
          <p className="font-medium text-[var(--pf-text-primary)]">{t('previewTitle')}</p>
          <p className="mt-2">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewDomains')}: </span>
            {preview.domains.map((d) => (he ? d.nameHe : d.nameEn)).join(', ')}
          </p>
          <p className="mt-1">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewChecklist')}: </span>
            {preview.documentChecklist.map((d) => (he ? d.nameHe : d.nameEn)).join(', ')}
          </p>
          <p className="mt-1">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewCategories')}: </span>
            {preview.extraExpenseCategories.map((c) => (he ? c.nameHe : c.nameEn)).join(', ')}
          </p>
          <p className="mt-1">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewWorkAreas')}: </span>
            {preview.workPackageNames.map((w) => (he ? w.nameHe : w.nameEn)).join(', ')}
          </p>
          <p className="mt-2 text-xs">{t('previewHint')}</p>
        </div>
      ) : null}

      <Button type="submit" loading={pending} variant="secondary">
        {t('apply')}
      </Button>
    </form>
  );
}
