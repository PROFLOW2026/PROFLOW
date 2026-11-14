'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Plus, FileSpreadsheet } from 'lucide-react';
import type { AnalysisSummary } from '../domain/contracts';
import { useTakeoffApi } from './api-provider';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { TakeoffUploadWizard } from './takeoff-upload-wizard';

export interface TakeoffAnalysesListProps {
  projectId: string;
  basePath: string;
  uploadApiBase: string;
  cloudBrowserActions?: ProjectCloudFileBrowserActions;
}

export function TakeoffAnalysesList({
  projectId,
  basePath,
  uploadApiBase,
  cloudBrowserActions,
}: TakeoffAnalysesListProps) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const router = useRouter();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listAnalyses(projectId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    const run = () => void refresh();
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  const startNew = () => {
    setWizardOpen(true);
  };

  const statusLabel = (status: AnalysisSummary['status']) => t(`status.${status}`);

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--pf-text-primary)]">{t('list.title')}</h1>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.subtitle')}</p>
        </div>
        <Button
          type="button"
          data-testid="takeoff-new-analysis"
          className="min-h-11 w-full sm:w-auto"
          onClick={startNew}
        >
          <Plus className="size-4" />
          {t('list.newAnalysis')}
        </Button>
      </header>

      {loading ? (
        <p className="text-sm text-[var(--pf-text-muted)]" role="status">
          {t('common.loading')}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-6 text-center">
          <FileSpreadsheet className="mx-auto mb-2 size-8 text-[var(--pf-text-muted)]" aria-hidden />
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-start hover:bg-[var(--pf-action-subtle-hover)]"
                onClick={() => router.push(`${basePath}/${row.id}`)}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--pf-text-primary)]">{row.name}</span>
                <span className="shrink-0 rounded-md bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs text-[var(--pf-text-secondary)]">
                  {statusLabel(row.status)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {wizardOpen ? (
        <TakeoffUploadWizard
          projectId={projectId}
          uploadApiBase={uploadApiBase}
          cloudBrowserActions={cloudBrowserActions}
          onClose={() => {
            setWizardOpen(false);
            void refresh();
          }}
          onStarted={(analysisId) => {
            setWizardOpen(false);
            router.push(`${basePath}/${analysisId}`);
          }}
        />
      ) : null}
    </div>
  );
}