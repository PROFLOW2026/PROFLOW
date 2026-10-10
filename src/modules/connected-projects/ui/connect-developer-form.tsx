'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { DeveloperEngagementPreview } from '../domain/types';

export interface ConnectDeveloperActionState {
  readonly error?: string;
  readonly success?: string;
  readonly preview?: DeveloperEngagementPreview;
  readonly contractorProjectId?: string;
  readonly code?: string;
}

type PreviewAction = (
  state: ConnectDeveloperActionState,
  formData: FormData,
) => Promise<ConnectDeveloperActionState>;

type AcceptAction = (
  state: ConnectDeveloperActionState,
  formData: FormData,
) => Promise<ConnectDeveloperActionState>;

export function ConnectDeveloperForm(props: {
  readonly organizationName: string;
  readonly actions: { readonly preview: PreviewAction; readonly accept: AcceptAction };
}) {
  const t = useTranslations('connectedProjects.contractor');
  const [previewState, previewAction, previewPending] = useActionState(props.actions.preview, {});
  const [acceptState, acceptAction, acceptPending] = useActionState(props.actions.accept, {});
  const [confirmOrg, setConfirmOrg] = useState(false);
  const [code, setCode] = useState('');
  const format = useFormatter();
  const codeValue = previewState.code ?? code;

  const preview = acceptState.preview ?? previewState.preview;
  const error = acceptState.error ?? previewState.error;
  const success = acceptState.success;
  const projectId = acceptState.contractorProjectId;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle', { orgName: props.organizationName })}</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? (
        <Alert tone="success">
          {success}
          {projectId ? (
            <p className="mt-2">
              <a className="underline" href={`../projects/${projectId}`}>
                {t('project')}
              </a>
            </p>
          ) : null}
        </Alert>
      ) : null}

      <form action={previewAction} className="flex flex-col gap-3">
        <Field label={t('codeLabel')}>
          {(control) => (
            <Input
              {...control}
              name="code"
              required
              autoComplete="off"
              value={codeValue}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" disabled={previewPending}>
          {t('preview')}
        </Button>
      </form>

      {preview ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] p-4">
          <h3 className="font-medium">{t('previewTitle')}</h3>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('developer')}</dt>
              <dd>{preview.developerOrganizationName}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('project')}</dt>
              <dd>{preview.developerProjectName}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('agreement')}</dt>
              <dd>{preview.agreementTitle ?? preview.agreementNumber ?? '—'}</dd>
            </div>
            {preview.contractNetAmount ? (
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('contractNet')}</dt>
                <dd>
                  {format.number(Number(preview.contractNetAmount), { style: 'currency', currency: preview.currency })}
                </dd>
              </div>
            ) : null}
            {(preview.startDate || preview.targetEndDate) && (
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('schedule')}</dt>
                <dd>{[preview.startDate, preview.targetEndDate].filter(Boolean).join(' → ')}</dd>
              </div>
            )}
          </dl>

          <form action={acceptAction} className="flex flex-col gap-3">
            <input type="hidden" name="code" value={codeValue} />
            <Field label={t('projectNameLabel')}>
              {(control) => <Input {...control} name="projectName" />}
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmOrg} onCheckedChange={(v) => setConfirmOrg(v === true)} />
              <span>{t('confirmOrg', { orgName: props.organizationName })}</span>
            </label>
            <input type="hidden" name="confirmOrganization" value={confirmOrg ? 'true' : 'false'} />
            <Button type="submit" disabled={!confirmOrg || acceptPending || !code}>
              {t('accept')}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
