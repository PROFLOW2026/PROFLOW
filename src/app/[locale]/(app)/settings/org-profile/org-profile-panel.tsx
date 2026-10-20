'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updateOrgProfileTypeAction, updateTerminologyConfigAction, type OrgProfileActionState } from './actions';
import {
  type OrgProfileType,
  type TerminologyOverrides,
  ORG_PROFILE_TYPES,
} from './org-profile-domain';

function ProfileTypeSelector({
  currentType,
  canEdit,
}: {
  currentType: OrgProfileType | null;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.orgProfilePanel');
  const [state, action, pending] = useActionState(updateOrgProfileTypeAction, {} as OrgProfileActionState);

  return (
    <MainAppSection title={t('profileTypeTitle')} description={t('profileTypeHint')}>
      <form action={action} className="flex w-full min-w-0 flex-col gap-4">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORG_PROFILE_TYPES.map((type) => {
            const isSelected = currentType === type;
            return (
              <label
                key={type}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? 'border-[var(--pf-brand-primary)] bg-[var(--pf-brand-primary)]/5'
                    : 'border-[var(--pf-border-default)] hover:border-[var(--pf-border-hover)]'
                } ${!canEdit ? 'pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name="orgProfileType"
                  value={type}
                  defaultChecked={isSelected}
                  className="sr-only"
                  disabled={!canEdit}
                />
                <span className="text-sm font-medium">{t(`types.${type}.label`)}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{t(`types.${type}.description`)}</span>
              </label>
            );
          })}
        </div>

        {canEdit && (
          <div>
            <Button type="submit" size="sm" loading={pending}>
              {t('saveProfileType')}
            </Button>
          </div>
        )}

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && (
          <Alert tone="success" role="status">
            {state.message}
          </Alert>
        )}
      </form>
    </MainAppSection>
  );
}

function TerminologyForm({
  overrides,
  canEdit,
}: {
  overrides: TerminologyOverrides;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.orgProfilePanel');
  const [state, action, pending] = useActionState(updateTerminologyConfigAction, {} as OrgProfileActionState);

  const fields = useMemo(
    () =>
      ([
        { key: 'project' as const, label: t('fieldProject') },
        { key: 'task' as const, label: t('fieldTask') },
        { key: 'board' as const, label: t('fieldBoard') },
        { key: 'stage' as const, label: t('fieldStage') },
        { key: 'bucket' as const, label: t('fieldBucket') },
      ]).map(({ key, label }) => ({
        key,
        label,
        defaultValue: t(`terminologyDefaults.${key}`),
      })),
    [t],
  );

  return (
    <MainAppSection title={t('terminologyTitle')} description={t('terminologyHint')}>
      <form action={action} className="flex w-full min-w-0 flex-col gap-4">
        <MainAppFormGrid dense className="gap-4">
          {fields.map(({ key, label, defaultValue }) => (
            <Field key={key} label={label} className={mainAppFieldSpan.md}>
              {(control) => (
                <>
                  <Input
                    id={control.id}
                    name={key}
                    defaultValue={overrides[key] ?? ''}
                    placeholder={defaultValue}
                    disabled={!canEdit}
                    aria-describedby={control['aria-describedby']}
                  />
                  <span className="text-xs text-[var(--pf-text-muted)]">
                    {t('defaultLabel', { value: defaultValue })}
                  </span>
                </>
              )}
            </Field>
          ))}
        </MainAppFormGrid>

        {canEdit && (
          <div>
            <Button type="submit" size="sm" loading={pending}>
              {t('saveTerminology')}
            </Button>
          </div>
        )}

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && (
          <Alert tone="success" role="status">
            {state.message}
          </Alert>
        )}
      </form>
    </MainAppSection>
  );
}

function TerminologyPreview({ overrides }: { overrides: TerminologyOverrides }) {
  const t = useTranslations('settings.orgProfilePanel');

  const resolve = (key: keyof TerminologyOverrides) =>
    overrides[key] || t(`terminologyDefaults.${key}`);

  const previewItems = [
    { label: t('previewProject'), value: resolve('project') },
    { label: t('previewTask'), value: resolve('task') },
    { label: t('previewBoard'), value: resolve('board') },
    { label: t('previewStage'), value: resolve('stage') },
    { label: t('previewBucket'), value: resolve('bucket') },
  ];

  return (
    <MainAppSection title={t('terminologyPreview')}>
      <div className="flex flex-wrap gap-3 text-sm">
        {previewItems.map(({ label, value }) => (
          <span key={label}>
            <span className="text-[var(--pf-text-muted)]">{label}</span> <strong>{value}</strong>
          </span>
        ))}
      </div>
    </MainAppSection>
  );
}

export function OrgProfilePanel({
  currentProfileType,
  terminologyOverrides,
  canEdit,
}: {
  currentProfileType: OrgProfileType | null;
  terminologyOverrides: TerminologyOverrides;
  canEdit: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <ProfileTypeSelector currentType={currentProfileType} canEdit={canEdit} />
      <TerminologyForm overrides={terminologyOverrides} canEdit={canEdit} />
      <TerminologyPreview overrides={terminologyOverrides} />
    </div>
  );
}
