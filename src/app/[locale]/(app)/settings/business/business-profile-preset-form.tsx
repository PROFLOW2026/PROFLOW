'use client';

import { useActionState, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BUSINESS_PROFILE_KEYS,
  getBusinessProfile,
} from '@/modules/tenancy/domain/business-profiles';
import { getBusinessProfileSetup } from '@/modules/tenancy/domain/business-profile-setup';
import { applyBusinessProfileAction, type SettingsActionState } from '../actions';

function uniqueJoin(values: readonly string[]): string {
  return [...new Set(values.filter(Boolean))].join(', ');
}

export function BusinessProfilePresetForm({
  canEdit,
  currentProfileKey,
}: {
  canEdit: boolean;
  currentProfileKey?: string | null;
}) {
  const t = useTranslations('settings.businessProfiles');
  const tAuth = useTranslations('auth.onboarding');
  const tModules = useTranslations('settings.modules');
  const tNav = useTranslations('nav.newMenu');
  const locale = useLocale();
  const initial =
    currentProfileKey && (BUSINESS_PROFILE_KEYS as readonly string[]).includes(currentProfileKey)
      ? currentProfileKey
      : BUSINESS_PROFILE_KEYS[0]!;
  const [preset, setPreset] = useState<string>(initial);
  const [state, action, pending] = useActionState(
    applyBusinessProfileAction,
    {} as SettingsActionState,
  );

  const preview = useMemo(() => getBusinessProfile(preset), [preset]);
  const setup = useMemo(() => (preview ? getBusinessProfileSetup(preview.key) : null), [preview]);
  const he = locale === 'he-IL';

  if (!canEdit) return null;

  const moduleLabels = preview
    ? preview.visibleModules
        .filter((key) => key !== 'portal')
        .map((key) => tModules(key))
    : [];
  const quickCreateLabels = preview
    ? preview.quickCreateEmphasis.slice(0, 5).map((key) => tNav(key))
    : [];
  const terminologyLabels = preview
    ? uniqueJoin([
        he ? preview.terminology.project.he : preview.terminology.project.en,
        he ? preview.terminology.job.he : preview.terminology.job.en,
        he ? preview.terminology.workOrder.he : preview.terminology.workOrder.en,
        he ? preview.terminology.serviceCall.he : preview.terminology.serviceCall.en,
      ])
    : '';

  return (
    <form action={action} className="flex w-full max-w-lg flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
      <div>
        <h2 className="text-start text-base font-semibold">{t('title')}</h2>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('label')}>
        {(control) => (
          <>
            <input type="hidden" name="businessProfile" value={preset} />
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_PROFILE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {tAuth(`profiles.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {preview ? (
        <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3 text-start text-sm text-[var(--pf-text-secondary)]">
          <p className="font-medium text-[var(--pf-text-primary)]">{t('previewTitle')}</p>
          <p className="mt-2 break-words">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewWorkMix')}: </span>
            {t(`workMix.${preview.workMix}`)}
          </p>
          <p className="mt-1 break-words">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewModules')}: </span>
            {moduleLabels.join(', ')}
          </p>
          <p className="mt-1 break-words">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewTerminology')}: </span>
            {terminologyLabels}
          </p>
          <p className="mt-1 break-words">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewQuickCreate')}: </span>
            {quickCreateLabels.join(', ')}
          </p>
          <p className="mt-1 break-words">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewCategories')}: </span>
            {preview.costCategories.map((c) => (he ? c.nameHe : c.nameEn)).join(', ')}
          </p>
          {setup ? (
            <>
              <p className="mt-1 break-words">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewFolders')}: </span>
                {setup.documentFolders.map((folder) => (he ? folder.nameHe : folder.nameEn)).join(', ')}
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewForms')}: </span>
                {setup.formTemplates.map((form) => (he ? form.nameHe : form.nameEn)).join(', ')}
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewTemplates')}: </span>
                {setup.projectTemplateKeys.join(', ')}
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewToday')}: </span>
                {t(`todayEmphasis.${setup.todayEmphasis}`)}
              </p>
            </>
          ) : null}
          <p className="mt-2 text-xs">{t('previewHint')}</p>
        </div>
      ) : null}

      <Button type="submit" loading={pending} variant="secondary">
        {t('apply')}
      </Button>
    </form>
  );
}
