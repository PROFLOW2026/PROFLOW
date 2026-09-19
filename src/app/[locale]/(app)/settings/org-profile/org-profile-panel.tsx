'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateOrgProfileTypeAction, updateTerminologyConfigAction, type OrgProfileActionState } from './actions';
import {
  ORG_PROFILE_TYPE_LABELS,
  DEFAULT_TERMINOLOGY,
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
  const [state, action, pending] = useActionState(updateOrgProfileTypeAction, {} as OrgProfileActionState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-sm font-medium">Organization profile type</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">
          Your profile type controls default stage definitions, templates, and which modules are recommended.
          Changing this does not delete any existing data.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ORG_PROFILE_TYPES.map((type) => {
          const info = ORG_PROFILE_TYPE_LABELS[type];
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
              <span className="text-sm font-medium">{info.label}</span>
              <span className="text-xs text-[var(--pf-text-secondary)]">{info.description}</span>
            </label>
          );
        })}
      </div>

      {canEdit && (
        <div>
          <Button type="submit" size="sm" loading={pending}>Save profile type</Button>
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
  const [state, action, pending] = useActionState(updateTerminologyConfigAction, {} as OrgProfileActionState);

  const fields: { key: keyof TerminologyOverrides; label: string }[] = [
    { key: 'project', label: 'Project label' },
    { key: 'task', label: 'Task label' },
    { key: 'board', label: 'Board label' },
    { key: 'stage', label: 'Stage label' },
    { key: 'bucket', label: 'Bucket label' },
  ];

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-sm font-medium">Terminology overrides</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">
          Customize labels shown throughout ProjectFlow to match your industry&apos;s vocabulary.
          Leave blank to use the default term.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-sm text-[var(--pf-text-secondary)]">{label}</label>
            <Input
              name={key}
              defaultValue={overrides[key] ?? ''}
              placeholder={DEFAULT_TERMINOLOGY[key]}
              disabled={!canEdit}
            />
            <span className="text-xs text-[var(--pf-text-muted)]">
              Default: <em>{DEFAULT_TERMINOLOGY[key]}</em>
            </span>
          </div>
        ))}
      </div>

      {canEdit && (
        <div>
          <Button type="submit" size="sm" loading={pending}>Save terminology</Button>
        </div>
      )}

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
  );
}

function TerminologyPreview({ overrides }: { overrides: TerminologyOverrides }) {
  const resolve = (key: keyof TerminologyOverrides) =>
    overrides[key] || DEFAULT_TERMINOLOGY[key];

  return (
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-surface-secondary)] p-4">
      <p className="mb-2 text-xs font-medium text-[var(--pf-text-muted)]">TERMINOLOGY PREVIEW</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <span>
          <span className="text-[var(--pf-text-muted)]">Project →</span>{' '}
          <strong>{resolve('project')}</strong>
        </span>
        <span>
          <span className="text-[var(--pf-text-muted)]">Task →</span>{' '}
          <strong>{resolve('task')}</strong>
        </span>
        <span>
          <span className="text-[var(--pf-text-muted)]">Board →</span>{' '}
          <strong>{resolve('board')}</strong>
        </span>
        <span>
          <span className="text-[var(--pf-text-muted)]">Stage →</span>{' '}
          <strong>{resolve('stage')}</strong>
        </span>
        <span>
          <span className="text-[var(--pf-text-muted)]">Bucket →</span>{' '}
          <strong>{resolve('bucket')}</strong>
        </span>
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
