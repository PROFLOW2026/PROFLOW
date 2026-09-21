'use client';

import { ArrowRight, Cloud, FileText, Folder, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import type {
  ProjectCloudFileBrowserActions,
  ProjectCloudFileBrowserContext,
  ProjectCloudFileRef,
} from '../client/project-cloud-file-picker-types';
import { toProjectCloudFileRef } from '../client/project-cloud-file-picker-types';
import type { ProviderFileItem, ProviderFolderItem } from '../client';
import { StorageLoadingOverlay } from './storage-loading-overlay';

type BrowseSegment = { readonly id: string; readonly name: string };

export type ProjectCloudFilePickerProps = {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (file: ProjectCloudFileRef) => void;
  readonly browserActions: ProjectCloudFileBrowserActions;
  readonly title?: string;
  readonly description?: string;
};

export function ProjectCloudFilePicker({
  projectId,
  open,
  onOpenChange,
  onSelect,
  browserActions,
  title,
  description,
}: ProjectCloudFilePickerProps) {
  const t = useTranslations('externalStorage.projectFiles');
  const tPicker = useTranslations('externalStorage.cloudPicker');
  const tFileSize = useTranslations('documents.fileSize');
  const [browserContext, setBrowserContext] = useState<ProjectCloudFileBrowserContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const initialLoadStartedRef = useRef(false);
  const skipInitialRootBrowseRef = useRef(true);
  const [browsePath, setBrowsePath] = useState<readonly BrowseSegment[]>([]);
  const [currentFolderName, setCurrentFolderName] = useState('');
  const [folders, setFolders] = useState<readonly ProviderFolderItem[]>([]);
  const [files, setFiles] = useState<readonly ProviderFileItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectCloudFileRef | null>(null);

  const resolveFolderExternalId = useCallback(
    (path: readonly BrowseSegment[]) =>
      path.length > 0 ? path[path.length - 1]!.id : browserContext?.projectRootFolderId,
    [browserContext?.projectRootFolderId],
  );

  const loadFolder = useCallback(
    (path: readonly BrowseSegment[]) => {
      if (!browserContext) return;
      startLoad(async () => {
        setError(null);
        const folderExternalId = resolveFolderExternalId(path);
        if (!folderExternalId) return;

        const segment = path.length > 0 ? path[path.length - 1] : null;
        const result = await browserActions.browseFolder({
          projectId,
          folderExternalId,
          folderName: segment?.name ?? null,
        });
        if (result.error) {
          setError(result.error);
          setFolders([]);
          setFiles([]);
          return;
        }
        setCurrentFolderName(result.folderName ?? '');
        setFolders(result.folders ?? []);
        setFiles(result.files ?? []);
      });
    },
    [browserActions, browserContext, projectId, resolveFolderExternalId],
  );

  useEffect(() => {
    if (!open) {
      initialLoadStartedRef.current = false;
      skipInitialRootBrowseRef.current = true;
      void Promise.resolve().then(() => {
        setInitialLoaded(false);
        setBrowserContext(null);
        setContextError(null);
        setBrowsePath([]);
        setSelectedFile(null);
        setError(null);
      });
      return;
    }

    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;

    startLoad(async () => {
      setContextError(null);
      setError(null);
      const result = await browserActions.loadInitial(projectId);
      if (result.error || !result.context) {
        setContextError(result.error ?? tPicker('unavailable'));
        return;
      }
      setBrowserContext(result.context);
      setCurrentFolderName(result.folderName ?? '');
      setFolders(result.folders ?? []);
      setFiles(result.files ?? []);
      setInitialLoaded(true);
    });
  }, [browserActions, open, projectId, tPicker]);

  useEffect(() => {
    if (!open || !browserContext || !initialLoaded) return;
    if (browsePath.length === 0 && skipInitialRootBrowseRef.current) {
      skipInitialRootBrowseRef.current = false;
      return;
    }
    loadFolder(browsePath);
  }, [browsePath, browserContext, initialLoaded, loadFolder, open]);

  const openSubfolder = (folder: ProviderFolderItem) => {
    setSelectedFile(null);
    setBrowsePath((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateBreadcrumb = (index: number) => {
    setSelectedFile(null);
    if (index < 0) {
      setBrowsePath([]);
      return;
    }
    setBrowsePath((prev) => prev.slice(0, index + 1));
  };

  const goBack = () => {
    setSelectedFile(null);
    setBrowsePath((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  };

  const jumpToSemanticFolder = (folder: { externalFolderId: string; displayName: string }) => {
    setSelectedFile(null);
    setBrowsePath([{ id: folder.externalFolderId, name: folder.displayName }]);
  };

  const breadcrumbTitle =
    browsePath.length > 0
      ? browsePath.map((segment) => segment.name).join(' / ')
      : browserContext?.projectRootFolderName;

  const handleConfirm = () => {
    if (!selectedFile) return;
    onSelect(selectedFile);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[min(85vh,720px)] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? tPicker('title')}</DialogTitle>
          <DialogDescription>{description ?? tPicker('description')}</DialogDescription>
        </DialogHeader>

        {contextError ? (
          <Alert tone="danger">{contextError}</Alert>
        ) : !browserContext ? (
          <div className="relative min-h-[12rem]">
            <StorageLoadingOverlay label={t('loading')} />
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {browserContext.semanticShortcuts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {browserContext.semanticShortcuts.map((shortcut) => (
                  <Button
                    key={shortcut.externalFolderId}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => jumpToSemanticFolder(shortcut)}
                    disabled={loading}
                  >
                    {shortcut.displayName}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {browsePath.length > 0 ? (
                <Button type="button" size="sm" variant="ghost" onClick={goBack} disabled={loading}>
                  <ArrowRight className="size-4 rotate-180" aria-hidden />
                  {t('back')}
                </Button>
              ) : null}
              <nav
                aria-label={t('breadcrumb')}
                className="flex min-w-0 flex-1 flex-wrap gap-1 text-sm"
              >
                <button
                  type="button"
                  className="truncate text-[var(--pf-text-secondary)] hover:underline"
                  onClick={() => navigateBreadcrumb(-1)}
                >
                  {browserContext.projectRootFolderName}
                </button>
                {browsePath.map((segment, index) => (
                  <span key={segment.id} className="flex min-w-0 items-center gap-1">
                    <span className="text-[var(--pf-text-secondary)]">/</span>
                    <button
                      type="button"
                      className="truncate hover:underline"
                      onClick={() => navigateBreadcrumb(index)}
                    >
                      {segment.name}
                    </button>
                  </span>
                ))}
              </nav>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => loadFolder(browsePath)}
                disabled={loading}
              >
                <RefreshCw className="size-4" aria-hidden />
                {t('refresh')}
              </Button>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <div className="relative min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--pf-border-default)]">
              {loading ? <StorageLoadingOverlay label={t('loading')} /> : null}
              <div className="p-2">
                <p className="mb-2 px-1 text-sm font-medium text-[var(--pf-text-secondary)]">
                  {breadcrumbTitle || currentFolderName}
                </p>
                {folders.length === 0 && files.length === 0 ? (
                  <EmptyState size="sm" title={t('empty')} className="py-8" />
                ) : (
                  <ul className="flex flex-col gap-1">
                    {folders.map((folder) => (
                      <li key={folder.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-[var(--pf-bg-muted)]"
                          onClick={() => openSubfolder(folder)}
                        >
                          <Folder className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
                        </button>
                      </li>
                    ))}
                    {files.map((file) => {
                      const ref = toProjectCloudFileRef(file);
                      const isSelected = selectedFile?.providerFileId === file.id;
                      return (
                        <li key={file.id}>
                          <button
                            type="button"
                            disabled={!ref}
                            aria-pressed={isSelected}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-[var(--pf-bg-muted)] ${
                              isSelected ? 'bg-[var(--pf-teal-50)] ring-1 ring-[var(--pf-text-brand)]' : ''
                            }`}
                            onClick={() => ref && setSelectedFile(ref)}
                          >
                            <FileText className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                            <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                            <span className="shrink-0 text-xs text-[var(--pf-text-muted)]">
                              {file.sizeBytes != null ? formatFileSize(file.sizeBytes, tFileSize) : '—'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {tPicker('cancel')}
          </Button>
          <Button type="button" disabled={!selectedFile} onClick={handleConfirm}>
            <Cloud aria-hidden />
            {tPicker('attachSelected')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
