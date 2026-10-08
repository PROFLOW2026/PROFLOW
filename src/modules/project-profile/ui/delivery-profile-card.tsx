'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  OWNERSHIP_MODELS,
  clientRequirement,
  resolveOwnershipModel,
  type DeliveryProfile,
  type OwnershipModel,
} from '../domain/profile';
import {
  MANAGEMENT_MODES,
  operatingRolesForMode,
  resolveManagementMode,
  type ManagementMode,
} from '../domain/management-mode';
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
  const [mode, setMode] = useState<ManagementMode>(resolveManagementMode(profile));
  const [ownership, setOwnership] = useState<OwnershipModel>(profile.ownershipModel);
  const [entityName, setEntityName] = useState(profile.developerEntityName ?? '');
  const [notes, setNotes] = useState(profile.notes ?? '');

  const operatingRoles = operatingRolesForMode(mode);
  const isDeveloper = mode === 'developer_gc';
  const effectiveOwnership = resolveOwnershipModel(operatingRoles, isDeveloper ? ownership : null);
  const requirement = clientRequirement({ operatingRoles, ownershipModel: effectiveOwnership });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const operatingRoles = operatingRolesForMode(mode);
    const developer = operatingRoles.includes('developer');
    action.run(
      saveProfile,
      {
        projectId,
        operatingRoles,
        ownershipModel: developer ? ownership : null,
        developerEntityName: developer ? entityName : null,
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
            <legend className="mb-1 text-sm font-medium text-[var(--pf-text-primary)]">{t('profile.modeLabel')}</legend>
            <select
              className={inputClassName}
              value={mode}
              onChange={(event) => {
                const next = event.target.value as ManagementMode;
                setMode(next);
                if (next === 'developer_gc' && !hasClient && ownership === 'client_project') {
                  setOwnership('own_development');
                }
              }}
            >
              {MANAGEMENT_MODES.map((option) => (
                <option key={option} value={option}>
                  {t(`profile.modes.${option}`)}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('profile.modeHint')}</p>
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
