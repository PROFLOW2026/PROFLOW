'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCALES } from '@/shared/i18n/config';
import { updateProfileAction, type SettingsActionState } from '../actions';

export function ProfileSettingsForm({
  displayName,
  localePreference,
  email,
}: {
  displayName: string | null;
  localePreference: string | null;
  email: string;
}) {
  const t = useTranslations('settings.profile');
  const tCommon = useTranslations('common');
  const [locale, setLocale] = useState(localePreference ?? 'he-IL');
  const [state, action, pending] = useActionState(updateProfileAction, {} as SettingsActionState);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={tCommon('labels.email')}>
        {(props) => <Input {...props} value={email} disabled readOnly />}
      </Field>

      <Field label={t('displayName')}>
        {(props) => <Input {...props} name="displayName" defaultValue={displayName ?? ''} />}
      </Field>

      <Field label={t('language')}>
        {(props) => (
          <>
            <input type="hidden" name="localePreference" value={locale} />
            <Select value={locale} onValueChange={setLocale}>
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

      <Button type="submit" loading={pending}>
        {tCommon('actions.save')}
      </Button>
    </form>
  );
}
