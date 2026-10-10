'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import type { ContractorSharedDocument } from '@/modules/project-plans';
import { acknowledgeSharedDocumentAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { saveCopyToMyStorageAction } from '../application/save-copy-to-my-storage';

type CopyFeedback =
  | { readonly kind: 'success'; readonly documentId: string }
  | { readonly kind: 'storage_not_configured' }
  | { readonly kind: 'download_not_permitted' }
  | { readonly kind: 'upload_failed' }
  | { readonly kind: 'no_portal_principal' };

export function ConnectedDeveloperDocumentsList({
  contractorProjectId,
  developerOrganizationId,
  developerProjectId,
  items,
  showSaveCopyAction,
}: {
  readonly contractorProjectId: string;
  readonly developerOrganizationId: string;
  readonly developerProjectId: string;
  readonly items: readonly ContractorSharedDocument[];
  readonly showSaveCopyAction: boolean;
}) {
  const t = useTranslations('projects.connectedDeveloper.documents');
  const tPortal = useTranslations('projectPlans.portal.documents');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copyFeedback, setCopyFeedback] = useState<Record<string, CopyFeedback>>({});

  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{tPortal('empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const feedback = copyFeedback[item.shareId];
        return (
          <li key={item.shareId} className="rounded-xl border border-[var(--pf-border-default)] p-4">
            <div className="flex flex-col gap-2">
              <a
                href={`${EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH}/${item.shareId}`}
                className="font-semibold text-[var(--pf-text-brand)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.title}
              </a>
              {item.note ? <p className="text-sm text-[var(--pf-text-secondary)]">{item.note}</p> : null}
              <div className="flex flex-wrap gap-2">
                {item.acknowledgementRequired && !item.acknowledgedAt ? (
                  <Button
                    type="button"
                    size="sm"
                    loading={pending}
                    onClick={() => {
                      startTransition(async () => {
                        await acknowledgeSharedDocumentAction({
                          organizationId: developerOrganizationId,
                          projectId: developerProjectId,
                          shareId: item.shareId,
                        });
                        router.refresh();
                      });
                    }}
                  >
                    {tPortal('acknowledge')}
                  </Button>
                ) : item.acknowledgedAt ? (
                  <p className="text-xs text-[var(--pf-text-muted)]">{tPortal('acknowledged')}</p>
                ) : null}
                {showSaveCopyAction ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await saveCopyToMyStorageAction({
                          contractorProjectId,
                          shareId: item.shareId,
                        });
                        if (result.ok) {
                          setCopyFeedback((prev) => ({
                            ...prev,
                            [item.shareId]: { kind: 'success', documentId: result.documentId },
                          }));
                          return;
                        }
                        setCopyFeedback((prev) => ({
                          ...prev,
                          [item.shareId]: { kind: result.reason },
                        }));
                      });
                    }}
                  >
                    {t('saveCopy')}
                  </Button>
                ) : null}
              </div>
              {feedback?.kind === 'success' ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {t('copySaved')}{' '}
                  <Link href={`/projects/${contractorProjectId}/documents`} className="underline">
                    {t('openProjectDocuments')}
                  </Link>
                </p>
              ) : null}
              {feedback?.kind === 'storage_not_configured' ? (
                <p className="text-xs text-[var(--pf-danger-fg)]">
                  {t('storageNotConfigured')}{' '}
                  <Link href="/settings/storage" className="underline">
                    {t('configureStorage')}
                  </Link>
                </p>
              ) : null}
              {feedback?.kind === 'download_not_permitted' ? (
                <p className="text-xs text-[var(--pf-danger-fg)]">{t('downloadNotPermitted')}</p>
              ) : null}
              {feedback?.kind === 'upload_failed' ? (
                <p className="text-xs text-[var(--pf-danger-fg)]">{t('copyFailed')}</p>
              ) : null}
              {feedback?.kind === 'no_portal_principal' ? (
                <p className="text-xs text-[var(--pf-danger-fg)]">{t('portalRequired')}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
