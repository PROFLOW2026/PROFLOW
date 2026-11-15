'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Trash2, FileSpreadsheet } from 'lucide-react';
import type { AnalysisSummary } from '../domain/contracts';
import { useTakeoffApi } from './api-provider';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { TakeoffUploadWizard } from './takeoff-upload-wizard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listAnalyses(projectId, { includeArchived: showArchived });
      const visible = showArchived ? list : list.filter((row) => !row.archivedAtIso);
      setItems(visible);
    } finally {
      setLoading(false);
    }
  }, [api, projectId, showArchived]);

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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? t('list.hideArchived') : t('list.showArchived')}
          </Button>
          <Button
            type="button"
            data-testid="takeoff-new-analysis"
            className="min-h-11 w-full sm:w-auto"
            onClick={startNew}
          >
            <Plus className="size-4" />
            {t('list.newAnalysis')}
          </Button>
        </div>
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
              <div className="flex min-h-11 w-full min-w-0 items-stretch gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-start hover:bg-[var(--pf-action-subtle-hover)]"
                  onClick={() => router.push(`${basePath}/${row.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--pf-text-primary)]">
                    {row.name}
                    {row.archivedAtIso ? (
                      <span className="ms-2 text-xs font-normal text-[var(--pf-text-muted)]">
                        {t('list.archivedBadge')}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-md bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs text-[var(--pf-text-secondary)]">
                    {statusLabel(row.status)}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 self-center"
                      aria-label={t('list.actionsMenu')}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuItem
                      onClick={async () => {
                        const next = window.prompt(t('list.renamePrompt'), row.name);
                        if (next == null || !next.trim()) return;
                        await api.renameAnalysis(row.id, next.trim());
                        void refresh();
                      }}
                    >
                      <Pencil className="size-4" />
                      {t('list.rename')}
                    </DropdownMenuItem>
                    {row.archivedAtIso ? (
                      <DropdownMenuItem
                        onClick={async () => {
                          await api.restoreAnalysis(row.id);
                          void refresh();
                        }}
                      >
                        <ArchiveRestore className="size-4" />
                        {t('list.restore')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={async () => {
                          await api.archiveAnalysis(row.id);
                          void refresh();
                        }}
                      >
                        <Archive className="size-4" />
                        {t('list.archive')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onClick={async () => {
                        if (!window.confirm(t('list.deleteConfirm', { name: row.name }))) return;
                        await api.deleteAnalysis(row.id);
                        void refresh();
                      }}
                    >
                      <Trash2 className="size-4" />
                      {t('list.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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