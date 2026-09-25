'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  createProjectTemplateAction,
  updateProjectTemplateAction,
  archiveProjectTemplateAction,
  duplicateProjectTemplateAction,
  type ProjectTemplateActionState,
} from './actions';

const ORG_PROFILE_VALUES = [
  '',
  'architect',
  'engineer',
  'consultant',
  'project_manager',
  'developer',
  'contractor',
  'subcontractor',
  'supervisor',
  'other',
] as const;

interface ProjectTemplateStageDef {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

interface ProjectTemplateDef {
  id: string;
  name: string;
  description: string | null;
  orgProfileType: string | null;
  isArchived: boolean;
  stages: ProjectTemplateStageDef[];
}

function useOrgProfileOptions() {
  const t = useTranslations('settings.projectTemplatesPanel');
  return useMemo(
    () =>
      ORG_PROFILE_VALUES.map((value) => ({
        value,
        label: value ? t(`orgProfile.${value}` as 'orgProfile.architect') : t('anyProfile'),
      })),
    [t],
  );
}

function ProjectTemplateRow({ template, canEdit }: { template: ProjectTemplateDef; canEdit: boolean }) {
  const t = useTranslations('settings.projectTemplatesPanel');
  const orgProfileOptions = useOrgProfileOptions();
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(
    updateProjectTemplateAction,
    {} as ProjectTemplateActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveProjectTemplateAction,
    {} as ProjectTemplateActionState,
  );
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateProjectTemplateAction,
    {} as ProjectTemplateActionState,
  );

  const profileLabel = orgProfileOptions.find((o) => o.value === template.orgProfileType)?.label;

  return (
    <div className={`flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 ${template.isArchived ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{template.name}</p>
          {template.description && (
            <p className="text-sm text-[var(--pf-text-secondary)]">{template.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {profileLabel && template.orgProfileType && (
              <Badge tone="brand" className="text-xs">{profileLabel}</Badge>
            )}
            {template.stages.length > 0 && (
              <Badge tone="neutral" className="text-xs">
                {t('stagesCount', { count: template.stages.length })}
              </Badge>
            )}
            {template.isArchived && (
              <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">
                {t('archived')}
              </Badge>
            )}
          </div>
          {template.stages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {template.stages.map((stage) => (
                <span
                  key={stage.id}
                  className="rounded-full bg-[var(--pf-surface-secondary)] px-2 py-0.5 text-xs"
                >
                  {stage.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? t('cancel') : t('edit')}
            </Button>
            {!template.isArchived ? (
              <form action={duplicateAction}>
                <input type="hidden" name="id" value={template.id} />
                <Button type="submit" size="sm" variant="ghost" loading={duplicatePending}>
                  {t('duplicate')}
                </Button>
              </form>
            ) : null}
            <form action={archiveAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="restore" value={template.isArchived ? 'true' : 'false'} />
              <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                {template.isArchived ? t('restore') : t('archive')}
              </Button>
            </form>
          </div>
        )}
      </div>

      {editing && (
        <form action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="id" value={template.id} />
          <Input name="name" defaultValue={template.name} placeholder={t('templateName')} required />
          <Textarea
            name="description"
            defaultValue={template.description ?? ''}
            placeholder={t('description')}
            rows={2}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--pf-text-secondary)]">{t('profileType')}</label>
            <select
              name="orgProfileType"
              defaultValue={template.orgProfileType ?? ''}
              className="rounded border border-[var(--pf-border-default)] bg-[var(--pf-surface-primary)] px-2 py-1.5 text-sm"
            >
              {orgProfileOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={updatePending}>{t('save')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
          {updateState.error && <Alert tone="danger">{updateState.error}</Alert>}
          {updateState.ok && <Alert tone="success" role="status">{updateState.message}</Alert>}
        </form>
      )}
      {archiveState.error && <Alert tone="danger">{archiveState.error}</Alert>}
      {duplicateState.error && <Alert tone="danger">{duplicateState.error}</Alert>}
      {duplicateState.ok && <Alert tone="success" role="status">{duplicateState.message}</Alert>}
    </div>
  );
}

function CreateProjectTemplateForm({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.projectTemplatesPanel');
  const orgProfileOptions = useOrgProfileOptions();
  const [state, action, pending] = useActionState(createProjectTemplateAction, {} as ProjectTemplateActionState);
  const [stages, setStages] = useState<string[]>(['', '', '']);

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">{t('createTitle')}</p>
      <Input name="name" placeholder={t('templateName')} required />
      <Textarea name="description" placeholder={t('descriptionOptional')} rows={2} />
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--pf-text-secondary)]">{t('profileType')}</label>
        <select
          name="orgProfileType"
          defaultValue=""
          className="rounded border border-[var(--pf-border-default)] bg-[var(--pf-surface-primary)] px-2 py-1.5 text-sm"
        >
          {orgProfileOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('stagesLabel')}</p>
        {stages.map((stage, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              name={`stageName_${idx}`}
              value={stage}
              onChange={(e) => {
                const next = [...stages];
                next[idx] = e.target.value;
                setStages(next);
              }}
              placeholder={t('stagePlaceholder', { index: idx + 1 })}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setStages(stages.filter((_, i) => i !== idx))}
            >
              ×
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setStages([...stages, ''])}>
          + {t('addStage')}
        </Button>
      </div>
      <div>
        <Button type="submit" size="sm" loading={pending}>{t('createTemplate')}</Button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
  );
}

export function ProjectTemplatesPanel({
  templates,
  canEdit,
}: {
  templates: ProjectTemplateDef[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.projectTemplatesPanel');
  const tSection = useTranslations('settings.projectTemplatesSection');
  const active = templates.filter((item) => !item.isArchived);
  const archived = templates.filter((item) => item.isArchived);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{tSection('description')}</p>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        {active.length === 0 && (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('emptyState')}</p>
        )}
        {active.map((item) => (
          <ProjectTemplateRow key={item.id} template={item} canEdit={canEdit} />
        ))}
      </div>

      <CreateProjectTemplateForm canEdit={canEdit} />

      {archived.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('hideArchived') : t('showArchived', { count: archived.length })}
          </Button>
          {showArchived && (
            <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4 opacity-60">
              {archived.map((item) => (
                <ProjectTemplateRow key={item.id} template={item} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
