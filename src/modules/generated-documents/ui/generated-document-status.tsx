'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { GeneratedArtifactSummary } from '../domain/types';

export function GeneratedDocumentStatus({
  artifacts,
}: {
  readonly artifacts: readonly GeneratedArtifactSummary[];
}) {
  const t = useTranslations('generatedDocuments');
  const latest = artifacts[0];
  if (!latest) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pf-text-muted)] print:hidden">
      <span>{t('storedStatus', { date: latest.generatedAt.slice(0, 10) })}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={() => window.open(`/api/org-storage/download/${latest.documentId}`, '_blank')}
      >
        {t('openStoredFile')}
      </Button>
      {artifacts.length > 1 ? (
        <span>{t('versionCount', { count: artifacts.length })}</span>
      ) : null}
    </div>
  );
}
