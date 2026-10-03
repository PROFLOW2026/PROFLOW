'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  OPERATING_ROLES,
  OWNERSHIP_MODELS,
  clientRequirement,
  normalizeOperatingRoles,
  resolveOwnershipModel,
  type DeliveryProfile,
  type OperatingRole,
  type OwnershipModel,
} from '../domain/profile';
import type { ProjectStructureActions } from './types';
import { useStructureAction } from './use-structure-action';

export function DeliveryProfileCard({
  projectId,
  profile,
  canEdit,
  hasClient,
  saveProfile,
}: {
  readonly projectId: string;
  readonly profile: DeliveryProfile;
  readonly canEdit: boolean;
  readonly hasClient: boolean;
  readonly saveProfile: ProjectStructureActions['saveProfile'];
}) {
  const t = useTranslations('projectProfile');
  const action = useStructureAction();
  const [roles, setRoles] = useState<OperatingRole[]>([...profile.operatingRoles]);
  const [ownership, setOwnership] = useState<OwnershipModel>(profile.ownershipModel);
  const [entityName, setEntityName] = useState(profile.developerEntityName ?? '');
  const [notes, setNotes] = useState(profile.notes ?? '');

  const isDeveloper = roles.includes('developer');
  const effectiveOwnership = resolveOwnershipModel(roles, isDeveloper ? ownership : null);
  const requirement = clientRequirement({ operatingRoles: roles, ownershipModel: effectiveOwnership });

  const toggleRole = (role: OperatingRole, checked: boolean) => {
    const next = normalizeOperatingRoles(checked ? [...roles, role] : roles.filter((r) => r !== role));
    setRoles(next);
    if (role === 'developer' && checked && ownership === 'client_project' && !hasClient) setOwnership('own_development');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.run(
      saveProfile,
      {
        projectId,
        operatingRoles: roles,
        ownershipModel: isDeveloper ? ownership : null,
        developerEntityName: isDeveloper ? entityName : null,
        notes,
      },
      () => t('profile.saved'),
    );
  };

  return (
    <Card id="profile">
      <CardHeader>
        <CardTitle>{t('profile.title')}</CardTitle>
        <CardDescription>{t('profile.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <fieldset className="flex flex-col gap-3" disabled={!canEdit || action.pending}>
            <legend className="mb-1 text-sm font-medium text-[var(--pf-text-primary)]">{t('profile.rolesLabel')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {OPERATING_ROLES.map((role) => {
                const checkboxId = `profile-role-${role}`;
                return (
                  <label
                    key={role}
                    htmlFor={checkboxId}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={roles.includes(role)}
                      onCheckedChange={(checked) => toggleRole(role, checked === true)}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{t(`profile.roles.${role}`)}</span>
                      <span className="text-xs text-[var(--pf-text-secondary)]">{t(`profile.roleHints.${role}`)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {roles.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-[var(--pf-text-secondary)]">
                <Badge tone="neutral">{t('profile.standard')}</Badge>
                {t('profile.standardHint')}
              </p>
            ) : null}
          </fieldset>

          {isDeveloper ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('profile.ownershipLabel')}>
                {(props) => (
                  <select
                    {...props}
                    className={inputClassName}
                    value={ownership}
                    disabled={!canEdit || action.pending}
                    onChange={(event) => setOwnership(event.target.value as OwnershipModel)}
                  >
                    {OWNERSHIP_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {t(`profile.ownership.${model}`)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('profile.developerEntityName')} description={t('profile.developerEntityHint')}>
                {(props) => (
                  <Input
                    {...props}
                    value={entityName}
                    maxLength={200}
                    disabled={!canEdit || action.pending}
                    onChange={(event) => setEntityName(event.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <Alert tone="info" role="status">
            <p className="text-sm">
              {requirement === 'not_applicable' ? t('profile.clientNotApplicable') : t('profile.clientOptional')}
            </p>
          </Alert>

          <Field label={t('profile.notes')}>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={2000}
                value={notes}
                disabled={!canEdit || action.pending}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </Field>

          {action.error ? (
            <Alert tone="danger" role="alert">
              <p className="text-sm">{action.error}</p>
            </Alert>
          ) : null}
          {action.status ? <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">{action.status}</p> : null}

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" loading={action.pending} className="w-full sm:w-auto">
                {t('profile.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
