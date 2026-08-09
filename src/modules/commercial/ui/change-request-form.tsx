'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { changeRequestPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import { Link } from '@/shared/i18n/navigation';
import type { FormActionState } from '@/app/[locale]/(app)/changes/actions';

export interface ChangeRequestProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface ChangeRequestFormProps {
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  projectId?: string;
  projects?: readonly ChangeRequestProjectOption[];
  initial?: {
    title?: string;
    description?: string | null;
    direction?: 'addition' | 'reduction';
    requestedAmount?: string | null;
  };
  changeRequestId?: string;
  /** ISO server baseline for conflict detection on edit drafts. */
  serverUpdatedAt?: string | null;
}

export function ChangeRequestForm({
  action,
  projectId,
  projects = [],
  initial,
  changeRequestId,
  serverUpdatedAt = null,
}: ChangeRequestFormProps) {
  const t = useTranslations('changes.form');
  const tCommon = useTranslations('common.actions');
  const tOffline = useTranslations('offline');
  const [direction, setDirection] = useState<'addition' | 'reduction'>(initial?.direction ?? 'addition');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '');

  const offlineSuccessState = useMemo<FormActionState>(() => ({ offlineQueued: true }), []);

  const wrappedAction = useOfflineAwareFormAction<FormActionState>({
    kind: 'change_request',
    onlineAction: action,
    buildPayload: changeRequestPayloadFromFormData,
    resolveServerMeta: (_formData, payload) => ({
      serverId:
        typeof payload.changeRequestId === 'string'
          ? payload.changeRequestId
          : (changeRequestId ?? null),
      serverUpdatedAt: changeRequestId ? serverUpdatedAt : null,
    }),
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [state, formAction, pending] = useActionState(wrappedAction, {});

  const resolvedProjectId = projectId ?? selectedProjectId;

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {resolvedProjectId ? (
        <input type="hidden" name="projectId" value={resolvedProjectId} />
      ) : null}
      {changeRequestId ? <input type="hidden" name="changeRequestId" value={changeRequestId} /> : null}
      <input type="hidden" name="direction" value={direction} />

      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      {!projectId ? (
        <Field label={t('project')} required description={t('projectHint')}>
          {(control) => (
            <Select
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              required
            >
              <SelectTrigger
                id={control.id}
                aria-describedby={control['aria-describedby']}
                aria-required="true"
              >
                <SelectValue placeholder={t('projectPlaceholder')} />
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
      ) : null}

      <Field label={t('title')} required>
        {(control) => (
          <Input {...control} name="title" required defaultValue={initial?.title ?? ''} />
        )}
      </Field>

      <Field label={t('description')}>
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={3}
            defaultValue={initial?.description ?? ''}
          />
        )}
      </Field>

      <Field label={t('direction')} required>
        {(control) => (
          <Select value={direction} onValueChange={(value) => setDirection(value as 'addition' | 'reduction')}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="addition">{t('directionAddition')}</SelectItem>
              <SelectItem value="reduction">{t('directionReduction')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('requestedAmount')} description={t('requestedAmountHint')}>
        {(control) => (
          <Input
            {...control}
            name="requestedAmount"
            inputMode="decimal"
            defaultValue={initial?.requestedAmount ?? ''}
            dir="ltr"
          />
        )}
      </Field>

      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={pending || (!projectId && !selectedProjectId)}>
          {changeRequestId ? t('save') : t('create')}
        </Button>
        <Button type="button" variant="secondary" asChild>
          <Link href={projectId ? `/projects/${projectId}` : '/changes'}>{tCommon('cancel')}</Link>
        </Button>
      </div>
    </form>
  );
}
