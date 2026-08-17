'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUSINESS_PROFILE_KEYS, getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import { WORK_MIXES, type WorkMix } from '@/modules/tenancy/domain/work-mix';
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

/**
 * Required step: name + country.
 * Recommended next step: business profile + work mix (skippable).
 */
export function OnboardingForm() {
  const t = useTranslations('auth.onboarding');
  const [step, setStep] = useState<'required' | 'recommended'>('required');
  const [name, setName] = useState('');
  const [country, setCountry] = useState<(typeof COUNTRY_CODES)[number]>('IL');
  const [preset, setPreset] = useState<string>('none');
  const [workMix, setWorkMix] = useState<WorkMix>('projects');
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    createOrganizationAction,
    {},
  );

  if (step === 'required') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('stepRequired')}</p>

        <Field label={t('organizationName')} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('organizationNamePlaceholder')}
              autoFocus
              required
            />
          )}
        </Field>

        <Field label={t('country')} required description={t('countryHint')}>
          {(control) => (
            <Select
              value={country}
              onValueChange={(value) => setCountry(value as (typeof COUNTRY_CODES)[number])}
            >
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
          )}
        </Field>

        <Button
          type="button"
          block
          disabled={!name.trim()}
          onClick={() => setStep('recommended')}
        >
          {t('continue')}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="countryCode" value={country} />
      <input type="hidden" name="businessProfile" value={preset} />
      <input type="hidden" name="workMix" value={workMix} />

      <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('stepRecommended')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('recommendedHint')}</p>

      <Field label={t('presetLabel')} optionalLabel={t('presetOptional')} description={t('presetHint')}>
        {(control) => (
          <Select
            value={preset}
            onValueChange={(value) => {
              setPreset(value);
              setWorkMix(getBusinessProfile(value)?.workMix ?? 'projects');
            }}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('presetNone')}</SelectItem>
              {BUSINESS_PROFILE_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`profiles.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('workMixLabel')} description={t('workMixHint')}>
        {(control) => (
          <Select value={workMix} onValueChange={(value) => setWorkMix(value as WorkMix)}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_MIXES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`workMix.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <Button type="submit" loading={pending} block>
          {t('submit')}
        </Button>
        <Button type="button" variant="ghost" block onClick={() => setStep('required')}>
          {t('back')}
        </Button>
      </div>
    </form>
  );
}
