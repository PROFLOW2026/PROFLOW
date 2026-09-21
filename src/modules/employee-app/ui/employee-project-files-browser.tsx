'use client';

import { ArrowRight, FileText, Folder, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import type {
  ProviderFileItem,
  ProviderFolderItem,
  SemanticFolderType,
  StorageProviderKey,
} from '@/modules/external-storage/client';
import { buildStorageFileDownloadUrl } from '@/modules/external-storage/client/storage-file-urls';
import { StorageFilePreviewDialog } from '@/modules/external-storage/ui/storage-file-preview-dialog';
import { StorageLoadingOverlay } from '@/modules/external-storage/ui/storage-loading-overlay';
import {
  browseEmployeeProjectFolderAction,
  loadEmployeeProjectFileBrowserInitialAction,
} from '@/app/[locale]/employee/(shell)/projects/project-files-actions';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from './employee-surface-styles';

type BrowseSegment = { readonly id: string; readonly name: string };

type BrowserContext = {
  provider: StorageProviderKey;
  projectRootFolderId: string;
  projectRootFolderName: string;
  semanticShortcuts: ReadonlyArray<{
    semanticFolderType: SemanticFolderType;
    externalFolderId: string;
    displayName: string;
  }>;
};

export function EmployeeProjectFilesBrowser({
  projectId,
  storageConfigured,
  hasFolderAccess,
}: {
  projectId: string;
  storageConfigured: boolean;
  hasFolderAccess: boolean;
}) {
  const t = useTranslations('employeeApp.projects.files');
  const tStorage = useTranslations('externalStorage.errors');
  const tProjectFiles = useTranslations('externalStorage.projectFiles');
  const tFileSize = useTranslations('documents.fileSize');
  const [browserContext, setBrowserContext] = useState<BrowserContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const initialLoadStartedRef = useRef(false);
  const skipInitialRootBrowseRef = useRef(true);
  const [browsePath, setBrowsePath] = useState<readonly BrowseSegment[]>([]);
  const [_currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState('');
  const [folders, setFolders] = useState<readonly ProviderFolderItem[]>([]);
  const [files, setFiles] = useState<readonly ProviderFileItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ProviderFileItem | null>(null);

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
        const result = await browseEmployeeProjectFolderAction({
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
        setCurrentFolderId(result.folderExternalId ?? null);
        setCurrentFolderName(result.folderName ?? '');
        setFolders(result.folders ?? []);
        setFiles(result.files ?? []);
      });
    },
    [browserContext, projectId, resolveFolderExternalId],
  );

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;

    startLoad(async () => {
      setContextError(null);
      setError(null);
      const result = await loadEmployeeProjectFileBrowserInitialAction(projectId);
      if (result.error || !result.context) {
        setContextError(result.error ?? tStorage('fileUnavailable'));
        return;
      }
      setBrowserContext(result.context);
      setCurrentFolderId(result.folderExternalId ?? null);
      setCurrentFolderName(result.folderName ?? '');
      setFolders(result.folders ?? []);
      setFiles(result.files ?? []);
      setInitialLoaded(true);
    });
  }, [projectId, tStorage]);

  useEffect(() => {
    if (!browserContext || !initialLoaded) return;
    if (browsePath.length === 0 && skipInitialRootBrowseRef.current) {
      skipInitialRootBrowseRef.current = false;
      return;
    }
    loadFolder(browsePath);
  }, [browserContext, browsePath, initialLoaded, loadFolder]);

  if (!hasFolderAccess) {
    return (
      <EmptyState size="sm" title={t('noPermission')} description={t('noPermissionHint')} />
    );
  }

  if (!storageConfigured) {
    return (
      <Alert tone="info">{t('storageNotConnected')}</Alert>
    );
  }

  if (contextError) {
    return <Alert tone="danger">{contextError}</Alert>;
  }

  if (!browserContext) {
    return (
      <div className="relative min-h-[12rem]">
        <StorageLoadingOverlay label={tProjectFiles('loading')} />
      </div>
    );
  }

  const openSubfolder = (folder: ProviderFolderItem) => {
    setBrowsePath((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateBreadcrumb = (index: number) => {
    if (index < 0) {
      setBrowsePath([]);
      return;
    }
    setBrowsePath((prev) => prev.slice(0, index + 1));
  };

  const goBack = () => {
    setBrowsePath((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  };

  const jumpToSemanticFolder = (folder: { externalFolderId: string; displayName: string }) => {
    setBrowsePath([{ id: folder.externalFolderId, name: folder.displayName }]);
  };

  const refreshListing = () => loadFolder(browsePath);

  const openFilePreview = (file: ProviderFileItem) => setPreviewFile(file);

  const openFileOnDevice = (file: ProviderFileItem) => {
    const url = buildStorageFileDownloadUrl({
      scope: 'project',
      projectId,
      fileId: file.id,
      disposition: 'attachment',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const breadcrumbTitle =
    browsePath.length > 0
      ? browsePath.map((segment) => segment.name).join(' / ')
      : browserContext.projectRootFolderName;

  const isEmpty = folders.length === 0 && files.length === 0;
  const noFoldersAllowed =
    browsePath.length === 0 &&
    browserContext.semanticShortcuts.length === 0 &&
    folders.length === 0 &&
    files.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {browserContext.semanticShortcuts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {browserContext.semanticShortcuts.map((shortcut) => (
            <Button
              key={shortcut.externalFolderId}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => jumpToSemanticFolder(shortcut)}
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
            {tProjectFiles('back')}
          </Button>
        ) : null}
        <nav aria-label={tProjectFiles('breadcrumb')} className="flex min-w-0 flex-1 flex-wrap gap-1 text-sm">
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
        <Button type="button" size="sm" variant="secondary" onClick={refreshListing} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {tProjectFiles('refresh')}
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="relative border-0 shadow-none">
        {loading ? (
          <StorageLoadingOverlay label={tProjectFiles('loading')} />
        ) : null}
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-base">{breadcrumbTitle || currentFolderName}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {noFoldersAllowed ? (
            <EmptyState size="sm" title={t('noFoldersAllowed')} description={t('noFoldersAllowedHint')} />
          ) : isEmpty ? (
            <EmptyState size="sm" title={t('empty')} />
          ) : (
            <ul className={employeeListPanelClass}>
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={`${employeeListRowClass} w-full text-start`}
                    onClick={() => openSubfolder(folder)}
                  >
                    <Folder className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold text-[var(--pf-text-primary)]">
                      {folder.name}
                    </span>
                  </button>
                </li>
              ))}
              {files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    className={`${employeeListRowClass} w-full text-start`}
                    onClick={() => openFilePreview(file)}
                  >
                    <FileText className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold text-[var(--pf-text-primary)]">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-sm text-[var(--pf-text-secondary)]">
                      {file.sizeBytes != null ? formatFileSize(file.sizeBytes, tFileSize) : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <StorageFilePreviewDialog
        open={previewFile !== null}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        scope="project"
        projectId={projectId}
        file={
          previewFile
            ? {
                fileId: previewFile.id,
                filename: previewFile.name,
                mimeType: previewFile.mimeType ?? '',
              }
            : null
        }
        siblingFiles={files}
        onOpenOnDevice={(target) => {
          const file = files.find((item) => item.id === target.fileId);
          if (file) openFileOnDevice(file);
        }}
        provider={browserContext.provider}
      />
    </div>
  );
}
