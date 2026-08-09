'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectStructureSnapshot } from '@/modules/projects/application/clone-project-structure';
import {
  cloneProjectStructureAction,
  previewCloneStructureAction,
  type ProjectFormState,
} from '../actions';

interface CloneProjectStructureFormProps {
  projectId: string;
  candidates: readonly { id: string; name: string }[];
}

export function CloneProjectStructureForm({
  projectId,
  candidates,
}: CloneProjectStructureFormProps) {
  const t = useTranslations('projects.clone');
  const [sourceId, setSourceId] = useState(candidates[0]?.id ?? '');
  const [preview, setPreview] = useState<ProjectStructureSnapshot | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pendingPreview, startPreview] = useTransition();
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    cloneProjectStructureAction,
    {},
  );

  const filtered = useMemo(
    () => candidates.filter((c) => c.id !== projectId),
    [candidates, projectId],
  );

  if (filtered.length === 0) return null;

  function loadPreview(nextSourceId: string) {
    setSourceId(nextSourceId);
    setPreview(null);
    setPreviewError(null);
    if (!nextSourceId) return;
    startPreview(async () => {
      const result = await previewCloneStructureAction(nextSourceId);
      if (result.error) {
        setPreviewError(result.error);
        return;
      }
      setPreview(result.snapshot ?? null);
    });
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="sourceProjectId" value={sourceId} />

      <div>
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('applied')}</Alert> : null}
      {previewError ? <Alert tone="danger">{previewError}</Alert> : null}

      <Field label={t('source')}>
        {(control) => (
          <Select
            value={sourceId}
            onValueChange={loadPreview}
          >
            <SelectTrigger id={control.id}>
              <SelectValue placeholder={t('chooseSource')} />
            </SelectTrigger>
            <SelectContent>
              {filtered.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {pendingPreview ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('loadingPreview')}</p>
      ) : null}

      {preview ? (
        <div className="text-sm text-[var(--pf-text-secondary)]">
          <p className="font-medium text-[var(--pf-text-primary)]">{t('previewTitle')}</p>
          <p className="mt-1">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewPackages')}: </span>
            {preview.workPackages.map((pkg) => pkg.name).join(', ')}
          </p>
          <p className="mt-1">
            <span className="font-medium text-[var(--pf-text-primary)]">{t('previewMilestones')}: </span>
            {preview.milestones.length > 0
              ? preview.milestones.map((m) => m.name).join(', ')
              : t('none')}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!preview && sourceId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pendingPreview}
            onClick={() => loadPreview(sourceId)}
          >
            {t('preview')}
          </Button>
        ) : null}
        <Button type="submit" variant="secondary" loading={pending} disabled={!sourceId}>
          {t('apply')}
        </Button>
      </div>
    </form>
  );
}
