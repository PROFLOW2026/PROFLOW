'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from '@/shared/i18n/navigation';
import {
  saveCompanyDetailsAction,
  type SettingsActionState,
} from '../actions';

const COUNTRY_CODES = ['IL', 'US', 'GB'] as const;

export interface CompanyDetailsValues {
  legalName: string;
  displayName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatTaxId: string | null;
  website: string | null;
  mainEmail: string | null;
  mainPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  billingEmail: string | null;
  salesEmail: string | null;
  supportEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

function CountryOptionLabel({ code }: { code: (typeof COUNTRY_CODES)[number] }) {
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

export function CompanyDetailsForm({
  values,
  canEdit,
}: {
  values: CompanyDetailsValues;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.companyDetails');
  const tCommon = useTranslations('common');
  const [country, setCountry] = useState(values.countryCode ?? '');
  const [state, action, pending] = useActionState(saveCompanyDetailsAction, {} as SettingsActionState);

  return (
    <form action={action} className="flex w-full min-w-0 max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t.rich('brandingLink', {
            link: (chunks) => (
              <Link href="/settings/branding" className="font-medium text-[var(--pf-action-primary)] underline-offset-2 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('legalName')} required className="sm:col-span-2">
          {(props) => (
            <Input {...props} name="legalName" defaultValue={values.legalName} disabled={!canEdit} required />
          )}
        </Field>
        <Field label={t('displayName')} required>
          {(props) => (
            <Input
              {...props}
              name="displayName"
              defaultValue={values.displayName}
              disabled={!canEdit}
              required
            />
          )}
        </Field>
        <Field label={t('tradingName')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="tradingName"
              defaultValue={values.tradingName ?? ''}
              disabled={!canEdit}
            />
          )}
        </Field>
        <Field
          label={t('vatTaxId')}
          optionalLabel={tCommon('labels.optional')}
          description={t('vatTaxIdHint')}
        >
          {(props) => (
            <Input
              {...props}
              name="vatTaxId"
              defaultValue={values.vatTaxId ?? ''}
              disabled={!canEdit}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label={t('registrationNumber')}
          optionalLabel={tCommon('labels.optional')}
          description={t('registrationNumberHint')}
        >
          {(props) => (
            <Input
              {...props}
              name="registrationNumber"
              defaultValue={values.registrationNumber ?? ''}
              disabled={!canEdit}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 border-t border-[var(--pf-border-default)] pt-4 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">{t('contactSection')}</h3>
        <Field label={t('mainPhone')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="mainPhone"
              defaultValue={values.mainPhone ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="tel"
            />
          )}
        </Field>
        <Field label={t('secondaryPhone')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="secondaryPhone"
              defaultValue={values.secondaryPhone ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="tel"
            />
          )}
        </Field>
        <Field label={t('whatsappPhone')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="whatsappPhone"
              defaultValue={values.whatsappPhone ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="tel"
            />
          )}
        </Field>
        <Field label={t('mainEmail')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="mainEmail"
              defaultValue={values.mainEmail ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="email"
            />
          )}
        </Field>
        <Field label={t('billingEmail')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="billingEmail"
              defaultValue={values.billingEmail ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="email"
            />
          )}
        </Field>
        <Field label={t('salesEmail')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="salesEmail"
              defaultValue={values.salesEmail ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="email"
            />
          )}
        </Field>
        <Field label={t('supportEmail')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="supportEmail"
              defaultValue={values.supportEmail ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="email"
            />
          )}
        </Field>
        <Field label={t('website')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="website"
              defaultValue={values.website ?? ''}
              disabled={!canEdit}
              dir="ltr"
              type="url"
              placeholder="https://"
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 border-t border-[var(--pf-border-default)] pt-4 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">{t('addressSection')}</h3>
        <Field label={t('addressLine1')} optionalLabel={tCommon('labels.optional')} className="sm:col-span-2">
          {(props) => (
            <Input
              {...props}
              name="addressLine1"
              defaultValue={values.addressLine1 ?? ''}
              disabled={!canEdit}
            />
          )}
        </Field>
        <Field label={t('addressLine2')} optionalLabel={tCommon('labels.optional')} className="sm:col-span-2">
          {(props) => (
            <Input
              {...props}
              name="addressLine2"
              defaultValue={values.addressLine2 ?? ''}
              disabled={!canEdit}
            />
          )}
        </Field>
        <Field label={t('city')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input {...props} name="city" defaultValue={values.city ?? ''} disabled={!canEdit} />
          )}
        </Field>
        <Field label={t('region')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input {...props} name="region" defaultValue={values.region ?? ''} disabled={!canEdit} />
          )}
        </Field>
        <Field label={t('postalCode')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <Input
              {...props}
              name="postalCode"
              defaultValue={values.postalCode ?? ''}
              disabled={!canEdit}
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('country')} optionalLabel={tCommon('labels.optional')}>
          {(props) => (
            <>
              <input type="hidden" name="countryCode" value={country} />
              <Select value={country || undefined} onValueChange={setCountry} disabled={!canEdit}>
                <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                  <SelectValue placeholder={t('countryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      <CountryOptionLabel code={code} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      </div>

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
