'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ONBOARDING_BUSINESS_TYPES,
  ONBOARDING_MANAGE_OPTIONS,
  ONBOARDING_WORK_STYLES,
  modulesForManageOptions,
  resolveOnboardingProfileKey,
  workMixForOnboardingStyle,
  type OnboardingBusinessType,
  type OnboardingManageOption,
  type OnboardingPath,
  type OnboardingWorkStyle,
} from '@/modules/tenancy/domain/onboarding-experience';
import { createOrganizationAction, type OnboardingFormState } from './actions';

const COUNTRY_CODES = ['IL', 'US', 'GB'] as const;

/** Customer-facing final choice: recommended vs all capabilities only. */
const CUSTOMER_ONBOARDING_PATHS = ['recommended', 'all'] as const satisfies readonly OnboardingPath[];

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
 * Personalized path: business type, work style, managed areas, then recommended vs all.
 */
export function OnboardingForm() {
  const t = useTranslations('auth.onboarding');
  const [step, setStep] = useState<'required' | 'experience'>('required');
  const [name, setName] = useState('');
  const [country, setCountry] = useState<(typeof COUNTRY_CODES)[number]>('IL');
  const [businessType, setBusinessType] = useState<OnboardingBusinessType>('GENERAL_CONTRACTOR');
  const [workStyle, setWorkStyle] = useState<OnboardingWorkStyle>('projects');
  const [manageOptions, setManageOptions] = useState<readonly OnboardingManageOption[]>([]);
  const [path, setPath] = useState<OnboardingPath>('recommended');
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    createOrganizationAction,
    {},
  );

  const workMix = workMixForOnboardingStyle(workStyle);
  const profileKey = resolveOnboardingProfileKey({ path, businessType });
  const extraModules = useMemo(
    () => (path === 'recommended' ? modulesForManageOptions(manageOptions) : []),
    [path, manageOptions],
  );

  function toggleManageOption(option: OnboardingManageOption) {
    setManageOptions((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  if (step === 'required') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('stepRequired')}</p>

        <Field id="onboarding-org-name" label={t('organizationName')} required>
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

        <Field id="onboarding-country" label={t('country')} required description={t('countryHint')}>
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
          onClick={() => setStep('experience')}
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
      <input type="hidden" name="businessProfile" value={profileKey ?? 'none'} />
      <input type="hidden" name="workMix" value={workMix} />
      <input type="hidden" name="moduleMode" value={path === 'recommended' ? 'replace' : 'additive'} />
      <input type="hidden" name="extraModules" value={extraModules.join(',')} />

      <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('stepExperience')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('experienceHint')}</p>

      <Field id="onboarding-business-type" label={t('businessTypeLabel')} description={t('businessTypeHint')}>
        {(control) => (
          <Select
            value={businessType}
            onValueChange={(value) => setBusinessType(value as OnboardingBusinessType)}
            disabled={path === 'all'}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ONBOARDING_BUSINESS_TYPES.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`businessTypes.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field id="onboarding-work-style" label={t('workStyleLabel')} description={t('workStyleHint')}>
        {(control) => (
          <Select
            value={workStyle}
            onValueChange={(value) => setWorkStyle(value as OnboardingWorkStyle)}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ONBOARDING_WORK_STYLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`workStyle.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {path === 'recommended' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('manageLabel')}
          </legend>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('manageHint')}</p>
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] p-2 sm:p-3">
            {ONBOARDING_MANAGE_OPTIONS.map((option) => {
              const checked = manageOptions.includes(option);
              return (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-muted)]"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleManageOption(option)}
                    aria-label={t(`manage.${option}`)}
                  />
                  <span>{t(`manage.${option}`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('pathLabel')}
        </legend>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('pathHint')}</p>
        <div className="flex flex-col gap-2">
          {CUSTOMER_ONBOARDING_PATHS.map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-lg border border-[var(--pf-border-default)] p-3 has-[:checked]:border-[var(--pf-action-primary)]"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--pf-text-primary)]">
                <input
                  type="radio"
                  name="onboardingPath"
                  value={value}
                  checked={path === value}
                  onChange={() => setPath(value)}
                  className="size-4 accent-[var(--pf-action-primary)]"
                />
                {t(`path.${value}`)}
              </span>
              <span className="ps-6 text-xs text-[var(--pf-text-muted)]">{t(`path.${value}Hint`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
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
