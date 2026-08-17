'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { enqueueProductDraft } from '@/modules/offline/ui';
import { useOfflineScope } from '@/modules/offline/ui/use-offline-aware-form-action';

export function FieldNoteDraftForm({
  projects,
  defaultNoteDate,
}: {
  projects: readonly { id: string; name: string }[];
  defaultNoteDate: string;
}) {
  const t = useTranslations('fieldOps.cockpit');
  const tOffline = useTranslations('offline');
  const scope = useOfflineScope();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (projects.length === 0) return null;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!scope?.organizationId || !scope.userId) {
          setError(tOffline('errors.missingOrganization'));
          return;
        }
        if (!projectId || !body.trim()) {
          setError(t('noteRequired'));
          return;
        }
        startTransition(async () => {
          try {
            await enqueueProductDraft({
              organizationId: scope.organizationId,
              userId: scope.userId,
              kind: 'note',
              payload: {
                projectId,
                workPackageId: null,
                noteDate: defaultNoteDate,
                body: body.trim(),
                title: null,
              },
            });
            setBody('');
            setSaved(true);
            setError(null);
          } catch {
            setError(tOffline('save.failed'));
            setSaved(false);
          }
        });
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">{t('noteTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('noteHint')}</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{tOffline('forms.draftSaved')}</Alert> : null}

      <Field label={t('noteProject')}>
        {(control) => (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id={control.id} className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('noteBody')}>
        {(control) => (
          <Textarea
            {...control}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            className="min-h-11"
            placeholder={t('notePlaceholder')}
          />
        )}
      </Field>

      <Button type="submit" loading={pending} className="min-h-11" block>
        {t('noteSave')}
      </Button>
    </form>
  );
}
