'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { ContractorSharedDocument } from '@/modules/project-plans';
import { acknowledgeSharedDocumentAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';

export function ContractorDocumentsList({
  organizationId,
  projectId,
  items,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly items: readonly ContractorSharedDocument[];
}) {
  const t = useTranslations('projectPlans.portal.documents');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
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
            {item.acknowledgementRequired && !item.acknowledgedAt ? (
              <Button
                type="button"
                size="sm"
                loading={pending}
                onClick={() => {
                  startTransition(async () => {
                    await acknowledgeSharedDocumentAction({ organizationId, projectId, shareId: item.shareId });
                    router.refresh();
                  });
                }}
              >
                {t('acknowledge')}
              </Button>
            ) : item.acknowledgedAt ? (
              <p className="text-xs text-[var(--pf-text-muted)]">{t('acknowledged')}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
