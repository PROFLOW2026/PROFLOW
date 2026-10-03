'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { unlinkCoordinationDocumentAction } from '../actions/internal-actions';
import { FormError } from './form-controls';
import type { DocumentRowView } from './types';

export function LinkedDocuments({
  projectId,
  eventId,
  documents,
  canManage,
}: {
  projectId: string;
  eventId: string;
  documents: readonly DocumentRowView[];
  canManage: boolean;
}) {
  const t = useTranslations('coordination');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (documents.length === 0) return <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noDocuments')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <FormError message={error} />
      <ul className="flex flex-col gap-1">
        {documents.map((document) => (
          <li key={document.id} className="flex min-h-11 items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{document.title}</span>
              {document.contractorVisible ? <Badge tone="brand">{t('fields.contractorVisible')}</Badge> : null}
            </span>
            {canManage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await unlinkCoordinationDocumentAction({ projectId, eventId, linkId: document.id });
                    if (!result.ok) setError(result.error);
                  })
                }
              >
                {t('actions.unlink')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
