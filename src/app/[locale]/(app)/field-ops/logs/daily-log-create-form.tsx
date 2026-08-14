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
import type { FieldOpsWorkPackageOption } from '@/modules/field-ops/domain/types';
import { dailyLogPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { Link } from '@/shared/i18n/navigation';
import { createDailyLogAction, type FieldOpsFormState } from '../actions';
import {
  FieldOpsPhotoStaging,
  useFieldOpsCreateFormAction,
  useStagedCreatePhotos,
} from '../field-ops-photo-staging';

const NONE = '__none__';

export function DailyLogCreateForm({
  projects,
  workPackages,
  defaultProjectId,
  defaultLogDate,
  canManageDocuments,
  storageConfigured,
}: {
  projects: readonly { id: string; name: string }[];
  workPackages: readonly FieldOpsWorkPackageOption[];
  defaultProjectId?: string;
  defaultLogDate: string;
  canManageDocuments: boolean;
  storageConfigured: boolean;
}) {
  const t = useTranslations('fieldOps.createLog');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const photos = useStagedCreatePhotos();

  const offlineSuccessState = useMemo<FieldOpsFormState>(() => ({ offlineQueued: true }), []);

  const wrappedAction = useFieldOpsCreateFormAction<FieldOpsFormState>({
    kind: 'daily_log',
    onlineAction: createDailyLogAction,
    buildPayload: dailyLogPayloadFromFormData,
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

      <Field label={t('projectLabel')} required error={state.fieldErrors?.projectId}>
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
        <Field label={t('workPackageLabel')} error={state.fieldErrors?.workPackageId}>
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

      <Field label={t('logDateLabel')} required error={state.fieldErrors?.logDate}>
        {(control) => (
          <Input {...control} type="date" name="logDate" defaultValue={defaultLogDate} required />
        )}
      </Field>

      <Field
        label={t('weatherLabel')}
        description={t('weatherHint')}
        error={state.fieldErrors?.weather}
      >
        {(control) => <Input {...control} name="weather" placeholder={t('weatherPlaceholder')} />}
      </Field>

      <Field
        label={t('summaryLabel')}
        description={t('summaryHint')}
        required
        error={state.fieldErrors?.summary}
      >
        {(control) => (
          <Textarea
            {...control}
            name="summary"
            rows={4}
            required
            placeholder={t('summaryPlaceholder')}
            className="min-h-24 text-base"
          />
        )}
      </Field>

      <Field
        label={t('workforceNotesLabel')}
        description={t('workforceNotesHint')}
        error={state.fieldErrors?.workforceNotes}
      >
        {(control) => (
          <Textarea
            {...control}
            name="workforceNotes"
            rows={3}
            placeholder={t('workforceNotesPlaceholder')}
            className="min-h-20 text-base"
          />
        )}
      </Field>

      <Field
        label={t('blockersLabel')}
        description={t('blockersHint')}
        error={state.fieldErrors?.blockers}
      >
        {(control) => (
          <Textarea
            {...control}
            name="blockers"
            rows={3}
            placeholder={t('blockersPlaceholder')}
            className="min-h-20 text-base"
          />
        )}
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
