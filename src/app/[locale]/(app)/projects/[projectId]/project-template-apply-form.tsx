'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PROJECT_TEMPLATE_KEYS,
  previewProjectTemplate,
  type ProjectTemplateKey,
} from '@/modules/projects/domain/templates';
import type { OrgStructureTemplatePreview } from '@/modules/tenancy/domain/org-structure-templates';
import {
  applyOrgProjectTemplateAction,
  applyProjectTemplateAction,
  type ProjectFormState,
} from '../actions';

interface ProjectTemplateApplyFormProps {
  projectId: string;
  locale: 'en' | 'he-IL';
  orgTemplates?: readonly OrgStructureTemplatePreview[];
}

type SourceMode = 'system' | 'org';

export function ProjectTemplateApplyForm({
  projectId,
  locale,
  orgTemplates = [],
}: ProjectTemplateApplyFormProps) {
  const t = useTranslations('projects.templates');
  const [mode, setMode] = useState<SourceMode>('system');
  const [templateKey, setTemplateKey] = useState<ProjectTemplateKey>(PROJECT_TEMPLATE_KEYS[0]!);
  const [orgTemplateId, setOrgTemplateId] = useState(orgTemplates[0]?.id ?? '');
  const [systemState, systemAction, systemPending] = useActionState<ProjectFormState, FormData>(
    applyProjectTemplateAction,
    {},
  );
  const [orgState, orgAction, orgPending] = useActionState<ProjectFormState, FormData>(
    applyOrgProjectTemplateAction,
    {},
  );

  const systemPreview = useMemo(
    () => previewProjectTemplate(templateKey, locale),
    [templateKey, locale],
  );
  const orgPreview = useMemo(
    () => orgTemplates.find((item) => item.id === orgTemplateId) ?? null,
    [orgTemplates, orgTemplateId],
  );

  const state = mode === 'system' ? systemState : orgState;
  const pending = mode === 'system' ? systemPending : orgPending;
  const formAction = mode === 'system' ? systemAction : orgAction;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {mode === 'system' ? (
        <input type="hidden" name="templateKey" value={templateKey} />
      ) : (
        <input type="hidden" name="orgTemplateId" value={orgTemplateId} />
      )}

      <div>
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('copySemantics')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('applied')}</Alert> : null}

      {orgTemplates.length > 0 ? (
        <Field label={t('source')}>
          {(control) => (
            <Select value={mode} onValueChange={(value) => setMode(value as SourceMode)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('sourceSystem')}</SelectItem>
                <SelectItem value="org">{t('sourceOrg')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

      {mode === 'system' ? (
        <Field label={t('choose')}>
          {(control) => (
            <Select
              value={templateKey}
              onValueChange={(value) => setTemplateKey(value as ProjectTemplateKey)}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TEMPLATE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`keys.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : (
        <Field label={t('choose')}>
          {(control) => (
            <Select value={orgTemplateId} onValueChange={setOrgTemplateId}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orgTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {mode === 'system' && systemPreview ? (
        <div className="text-sm text-[var(--pf-text-secondary)]">
          <p>{systemPreview.description}</p>
          <p className="mt-2">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewPackages')}: </span>
            {systemPreview.workPackageNames.join(', ')}
          </p>
            {systemPreview.milestoneNames.length > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewMilestones')}: </span>
                {systemPreview.milestoneNames.join(', ')}
              </p>
            ) : null}
            {systemPreview.folderNames.length > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-[var(--pf-text-primary)]">{t('previewFolders')}: </span>
                {systemPreview.folderNames.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

      {mode === 'org' && orgPreview ? (
        <div className="text-sm text-[var(--pf-text-secondary)]">
          {orgPreview.description ? <p>{orgPreview.description}</p> : null}
          <p className="mt-2">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewPackages')}: </span>
            {orgPreview.workPackageNames.join(', ')}
          </p>
          {orgPreview.milestoneNames.length > 0 ? (
            <p className="mt-1">
              <span className="font-medium text-[var(--pf-text-primary)]">{t('previewMilestones')}: </span>
              {orgPreview.milestoneNames.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          {t('apply')}
        </Button>
      </div>
    </form>
  );
}
