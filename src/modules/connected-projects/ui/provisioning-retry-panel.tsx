'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';

export function ProvisioningRetryPanel(props: {
  readonly mappingId: string;
  readonly developerProjectName: string | null;
  readonly action: (
    state: { error?: string; success?: string; projectId?: string },
    formData: FormData,
  ) => Promise<{ error?: string; success?: string; projectId?: string }>;
}) {
  const t = useTranslations('connectedProjects.contractor');
  const [state, formAction, pending] = useActionState(props.action, {});

  return (
    <Alert tone="danger" title={t('provisioningFailedTitle')}>
      <p className="text-sm">{t('provisioningFailedHint', { project: props.developerProjectName ?? '—' })}</p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="mappingId" value={props.mappingId} />
        <Button type="submit" variant="primary" loading={pending}>
          {t('retryProvisioning')}
        </Button>
      </form>
      {state.error ? <p className="mt-2 text-sm">{state.error}</p> : null}
      {state.success && state.projectId ? (
        <p className="mt-2 text-sm">
          {state.success}{' '}
          <Link className="underline" href={`/projects/${state.projectId}`}>
            {t('openProject')}
          </Link>
        </p>
      ) : null}
    </Alert>
  );
}
