'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { DailyLogRecord } from '@/modules/field-ops/domain/types';
import { dailyLogPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import { Link } from '@/shared/i18n/navigation';
import { updateDailyLogAction, type FieldOpsFormState } from '../actions';

function toServerUpdatedAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function DailyLogEditForm({ log }: { log: DailyLogRecord }) {
  const t = useTranslations('fieldOps.createLog');
  const tDetail = useTranslations('fieldOps.detail');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const serverUpdatedAt = toServerUpdatedAt(log.updatedAt);

  const offlineSuccessState = useMemo<FieldOpsFormState>(() => ({ offlineQueued: true }), []);

  const wrappedAction = useOfflineAwareFormAction<FieldOpsFormState>({
    kind: 'daily_log',
    onlineAction: updateDailyLogAction,
    buildPayload: (formData) => ({
      ...dailyLogPayloadFromFormData(formData),
      projectId: log.projectId,
      dailyLogId: log.id,
    }),
    resolveServerMeta: () => ({
      serverId: log.id,
      serverUpdatedAt,
    }),
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    wrappedAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="dailyLogId" value={log.id} />
      <input type="hidden" name="projectId" value={log.projectId} />
      {log.workPackageId ? (
        <input type="hidden" name="workPackageId" value={log.workPackageId} />
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tDetail('saved')}</Alert> : null}
      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      <Field label={t('logDateLabel')} required error={state.fieldErrors?.logDate}>
        {(control) => (
          <Input
            {...control}
            type="date"
            name="logDate"
            defaultValue={log.logDate}
            required
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('weatherLabel')} error={state.fieldErrors?.weather}>
        {(control) => (
          <Input
            {...control}
            name="weather"
            defaultValue={log.weather ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('summaryLabel')} required error={state.fieldErrors?.summary}>
        {(control) => (
          <Textarea
            {...control}
            name="summary"
            rows={4}
            required
            defaultValue={log.summary}
            className="min-h-24 text-base"
          />
        )}
      </Field>

      <Field label={t('workforceNotesLabel')} error={state.fieldErrors?.workforceNotes}>
        {(control) => (
          <Textarea
            {...control}
            name="workforceNotes"
            rows={3}
            defaultValue={log.workforceNotes ?? ''}
            className="min-h-20 text-base"
          />
        )}
      </Field>

      <Field label={t('blockersLabel')} error={state.fieldErrors?.blockers}>
        {(control) => (
          <Textarea
            {...control}
            name="blockers"
            rows={3}
            defaultValue={log.blockers ?? ''}
            className="min-h-20 text-base"
          />
        )}
      </Field>

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? tCommon('states.saving') : tDetail('saveLog')}
      </Button>
    </form>
  );
}
