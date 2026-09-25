'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-sm font-medium">{t('profileTypeTitle')}</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('profileTypeHint')}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <Button type="submit" size="sm" loading={pending}>{t('saveProfileType')}</Button>
        </div>
      )}

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
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
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-sm font-medium">{t('terminologyTitle')}</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('terminologyHint')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ key, label, defaultValue }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-sm text-[var(--pf-text-secondary)]">{label}</label>
            <Input
              name={key}
              defaultValue={overrides[key] ?? ''}
              placeholder={defaultValue}
              disabled={!canEdit}
            />
            <span className="text-xs text-[var(--pf-text-muted)]">
              {t('defaultLabel', { value: defaultValue })}
            </span>
          </div>
        ))}
      </div>

      {canEdit && (
        <div>
          <Button type="submit" size="sm" loading={pending}>{t('saveTerminology')}</Button>
        </div>
      )}

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
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
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-surface-secondary)] p-4">
      <p className="mb-2 text-xs font-medium text-[var(--pf-text-muted)]">{t('terminologyPreview')}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {previewItems.map(({ label, value }) => (
          <span key={label}>
            <span className="text-[var(--pf-text-muted)]">{label}</span>{' '}
            <strong>{value}</strong>
          </span>
        ))}
      </div>
    </div>
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
    <div className="flex flex-col gap-8">
      <ProfileTypeSelector currentType={currentProfileType} canEdit={canEdit} />
      <hr className="border-[var(--pf-border-default)]" />
      <TerminologyForm overrides={terminologyOverrides} canEdit={canEdit} />
      <TerminologyPreview overrides={terminologyOverrides} />
    </div>
  );
}
