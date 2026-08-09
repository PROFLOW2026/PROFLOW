'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { enqueueProductDraft } from '../data/enqueue-product-draft';
import { payloadBuilderForKind } from '../domain/payloads';
import type { DraftKind } from '../domain/types';
import { useOfflineOrganizationId } from './use-offline-aware-form-action';

/**
 * Explicit "Save offline draft" control. Prefer useOfflineAwareFormAction for
 * automatic offline submit interception; this is for always-available local save.
 */
export function OfflineDraftSaveControls({
  organizationId: organizationIdProp,
  kind,
  formId,
}: {
  readonly organizationId?: string;
  readonly kind: Exclude<DraftKind, 'capture'>;
  readonly formId?: string;
}) {
  const t = useTranslations('offline.save');
  const contextOrgId = useOfflineOrganizationId();
  const organizationId = organizationIdProp ?? contextOrgId;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  function save(form: HTMLFormElement | null) {
    if (!form) {
      setError(t('noForm'));
      return;
    }
    if (!organizationId) {
      setError(t('failed'));
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData(form);
        const buildPayload = payloadBuilderForKind(kind);
        await enqueueProductDraft({
          organizationId,
          kind,
          payload: buildPayload(formData),
        });
        setError(null);
        setMessage(t('saved'));
      } catch {
        setMessage(null);
        setError(t('failed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {offline ? <Alert tone="warning">{t('offlineHint')}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          loading={pending}
          onClick={(event) => {
            const form =
              (formId ? document.getElementById(formId) : null) ??
              event.currentTarget.closest('form');
            save(form instanceof HTMLFormElement ? form : null);
          }}
        >
          {pending ? t('saving') : t('saveDraft')}
        </Button>
        <Link
          href="/settings/offline-drafts"
          className="text-sm text-[var(--pf-text-muted)] underline-offset-2 hover:underline"
        >
          {t('viewDrafts')}
        </Link>
      </div>
    </div>
  );
}
