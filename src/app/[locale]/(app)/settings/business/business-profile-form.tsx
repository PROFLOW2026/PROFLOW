'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCALES } from '@/shared/i18n/config';
import { updateBusinessProfileAction, type SettingsActionState } from '../actions';

const COUNTRIES = [
  { code: 'IL', label: 'Israel' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
];

const TIMEZONES = ['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];

export function BusinessProfileForm({
  organization,
  canEdit,
}: {
  organization: {
    name: string;
    countryCode: string;
    baseCurrency: string;
    timezone: string;
    defaultLocale: string;
  };
  canEdit: boolean;
}) {
  const t = useTranslations('organization.profile');
  const tCommon = useTranslations('common');
  const [country, setCountry] = useState(organization.countryCode);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [locale, setLocale] = useState(organization.defaultLocale);
  const [state, action, pending] = useActionState(updateBusinessProfileAction, {} as SettingsActionState);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('name')} required>
        {(props) => (
          <Input {...props} name="name" defaultValue={organization.name} disabled={!canEdit} required />
        )}
      </Field>

      <Field label={t('country')} required>
        {(props) => (
          <>
            <input type="hidden" name="countryCode" value={country} />
            <Select value={country} onValueChange={setCountry} disabled={!canEdit}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('baseCurrency')} required>
        {(props) => (
          <Input
            {...props}
            name="baseCurrency"
            defaultValue={organization.baseCurrency}
            disabled={!canEdit}
            maxLength={3}
            required
          />
        )}
      </Field>

      <Field label={t('timezone')} required>
        {(props) => (
          <>
            <input type="hidden" name="timezone" value={timezone} />
            <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('defaultLocale')} required>
        {(props) => (
          <>
            <input type="hidden" name="defaultLocale" value={locale} />
            <Select value={locale} onValueChange={setLocale} disabled={!canEdit}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {canEdit ? (
        <div>
          <Button type="submit" loading={pending}>
            {tCommon('actions.save')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
