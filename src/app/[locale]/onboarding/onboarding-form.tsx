'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROFESSION_PRESET_KEYS } from '@/modules/tenancy/domain/profession-presets';
import { createOrganizationAction, type OnboardingFormState } from './actions';

const COUNTRY_CODES = ['IL', 'US', 'GB'] as const;

function CountryLabel({ code }: { code: (typeof COUNTRY_CODES)[number] }) {
  const t = useTranslations('onboarding');

  if (code === 'IL') {
    return (
      <>
        {t('countries.IL')} · <span dir="ltr">{t('countries.IL_latin')}</span>
      </>
    );
  }

  return t(`countries.${code}`);
}

export function OnboardingForm() {
  const t = useTranslations('auth.onboarding');
  const [country, setCountry] = useState<(typeof COUNTRY_CODES)[number]>('IL');
  const [preset, setPreset] = useState<string>('none');
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    createOrganizationAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('organizationName')} required>
        {(control) => (
          <Input {...control} name="name" placeholder={t('organizationNamePlaceholder')} autoFocus required />
        )}
      </Field>

      <Field label={t('country')} required description={t('countryHint')}>
        {(control) => (
          <>
            <input type="hidden" name="countryCode" value={country} />
            <Select value={country} onValueChange={(value) => setCountry(value as (typeof COUNTRY_CODES)[number])}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    <CountryLabel code={code} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('presetLabel')} optionalLabel={t('presetOptional')} description={t('presetHint')}>
        {(control) => (
          <>
            <input type="hidden" name="professionPreset" value={preset} />
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('presetNone')}</SelectItem>
                {PROFESSION_PRESET_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`presets.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
