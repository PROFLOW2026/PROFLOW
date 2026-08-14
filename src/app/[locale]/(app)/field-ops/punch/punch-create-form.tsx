'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PUNCH_PRIORITIES,
  type FieldOpsWorkPackageOption,
  type PunchPriority,
} from '@/modules/field-ops/domain/types';
import { punchPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { Link } from '@/shared/i18n/navigation';
import { createPunchListItemAction, type FieldOpsFormState } from '../actions';
import {
  FieldOpsPhotoStaging,
  useFieldOpsCreateFormAction,
  useStagedCreatePhotos,
} from '../field-ops-photo-staging';

const NONE = '__none__';

export function PunchCreateForm({
  projects,
  workPackages,
  defaultProjectId,
  canManageDocuments,
  storageConfigured,
}: {
  projects: readonly { id: string; name: string }[];
  workPackages: readonly FieldOpsWorkPackageOption[];
  defaultProjectId?: string;
  canManageDocuments: boolean;
  storageConfigured: boolean;
}) {
  const t = useTranslations('fieldOps.createPunch');
  const tPriorities = useTranslations('fieldOps.priorities');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const photos = useStagedCreatePhotos();
  const offlineSuccessState = useMemo<FieldOpsFormState>(() => ({ offlineQueued: true }), []);
  const wrappedAction = useFieldOpsCreateFormAction<FieldOpsFormState>({
    kind: 'punch',
    onlineAction: createPunchListItemAction,
    buildPayload: punchPayloadFromFormData,
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
    appendPhotos: photos.appendToFormData,
  });
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    wrappedAction,
    {},
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [workPackageId, setWorkPackageId] = useState(NONE);
  const [priority, setPriority] = useState<PunchPriority>('normal');

  const projectPackages = useMemo(
    () => workPackages.filter((pkg) => pkg.projectId === projectId),
    [workPackages, projectId],
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      <Field label={t('projectLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId} />
            <Select
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
                setWorkPackageId(NONE);
              }}
            >
              <SelectTrigger id={control.id}>
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
          </>
        )}
      </Field>

      {projectPackages.length > 0 ? (
        <Field label={t('workPackageLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="workPackageId"
                value={workPackageId === NONE ? '' : workPackageId}
              />
              <Select value={workPackageId} onValueChange={setWorkPackageId}>
                <SelectTrigger id={control.id}>
                  <SelectValue placeholder={t('workPackagePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('workPackageNone')}</SelectItem>
                  {projectPackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('titleLabel')} required error={state.fieldErrors?.title}>
        {(control) => <Input {...control} name="title" required autoFocus />}
      </Field>

      <Field label={t('descriptionLabel')} error={state.fieldErrors?.description}>
        {(control) => <Textarea {...control} name="description" rows={3} />}
      </Field>

      <Field label={t('priorityLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="priority" value={priority} />
            <Select value={priority} onValueChange={(v) => setPriority(v as PunchPriority)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUNCH_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tPriorities(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('locationLabel')}>
        {(control) => <Input {...control} name="location" />}
      </Field>

      <Field label={t('dueDateLabel')}>
        {(control) => <Input {...control} type="date" name="dueDate" />}
      </Field>

      <FieldOpsPhotoStaging
        files={photos.files}
        onFilesChange={photos.setFiles}
        canManageDocuments={canManageDocuments}
        storageConfigured={storageConfigured}
        disabled={pending}
      />

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}
