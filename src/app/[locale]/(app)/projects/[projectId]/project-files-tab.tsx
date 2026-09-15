'use client';

import { ArrowRight, Folder, FileText, MoreHorizontal, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/shared/i18n/navigation';
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StorageLoadingOverlay } from '@/modules/external-storage/ui/storage-loading-overlay';
import { useShareStorageFile } from '@/modules/external-storage/ui/use-share-storage-file';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import type {
  ProviderFileItem,
  ProviderFolderItem,
  SemanticFolderType,
  StorageProviderKey,
} from '@/modules/external-storage/client';
import { STORAGE_PROVIDER_LABELS } from '@/modules/external-storage/client';
import {
  prepareDocumentUploadAction,
  finalizeDocumentUploadAction,
} from '@/modules/documents/application/document-actions';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import {
  buildStorageFileDownloadUrl,
} from '@/modules/external-storage/client/storage-file-urls';
import { StorageFilePreviewDialog } from '@/modules/external-storage/ui/storage-file-preview-dialog';
import {
  browseProjectFolderAction,
  createProjectSubfolderAction,
  deleteProjectStorageItemAction,
  getProjectFileProviderUrlAction,
  listProjectMoveTargetsAction,
  loadProjectFileBrowserInitialAction,
  moveProjectStorageItemAction,
  renameProjectStorageItemAction,
} from './project-files-actions';

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

type NameDialogState =
  | { kind: 'create' }
  | { kind: 'rename'; itemId: string; itemKind: 'file' | 'folder'; currentName: string }
  | null;

type MoveDialogState = {
  itemId: string;
  itemKind: 'file' | 'folder';
  itemName: string;
} | null;

type DeleteTarget = {
  itemId: string;
  itemKind: 'file' | 'folder';
  itemName: string;
};

export function ProjectFilesTab({
  projectId,
  storageConfigured,
  canManage,
}: {
  projectId: string;
  storageConfigured: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('externalStorage.projectFiles');
  const tPreview = useTranslations('externalStorage.preview');
  const { sharing, shareError, setShareError, shareFile } = useShareStorageFile();
  const tStorage = useTranslations('externalStorage');
  const tErrors = useTranslations('externalStorage.errors');
  const tFileSize = useTranslations('documents.fileSize');
  const tAttach = useTranslations('documents.attachments');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const [browserContext, setBrowserContext] = useState<BrowserContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const initialLoadStartedRef = useRef(false);
  const skipInitialRootBrowseRef = useRef(true);
  const [browsePath, setBrowsePath] = useState<readonly BrowseSegment[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [folders, setFolders] = useState<readonly ProviderFolderItem[]>([]);
  const [files, setFiles] = useState<readonly ProviderFileItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [nameValue, setNameValue] = useState('');
  const [namePending, setNamePending] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [moveDialog, setMoveDialog] = useState<MoveDialogState>(null);
  const [moveTargets, setMoveTargets] = useState<readonly { id: string; pathLabel: string }[]>([]);
  const [moveTargetsLoading, setMoveTargetsLoading] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<DeleteTarget | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<ProviderFileItem | null>(null);

  const photosFolderId = browserContext?.semanticShortcuts.find(
    (s) => s.semanticFolderType === 'photos',
  )?.externalFolderId;

  const inPhotosTree = Boolean(
    photosFolderId &&
      (currentFolderId === photosFolderId ||
        browsePath.some((segment) => segment.id === photosFolderId)),
  );

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
        const result = await browseProjectFolderAction({
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
      const result = await loadProjectFileBrowserInitialAction(projectId);
      if (result.error || !result.context) {
        setContextError(result.error ?? tErrors('fileUnavailable'));
        return;
      }
      setBrowserContext(result.context);
      setCurrentFolderId(result.folderExternalId ?? null);
      setCurrentFolderName(result.folderName ?? '');
      setFolders(result.folders ?? []);
      setFiles(result.files ?? []);
      setInitialLoaded(true);
    });
  }, [projectId, tErrors]);

  useEffect(() => {
    if (!browserContext || !initialLoaded) return;
    if (browsePath.length === 0 && skipInitialRootBrowseRef.current) {
      skipInitialRootBrowseRef.current = false;
      return;
    }
    loadFolder(browsePath);
  }, [browserContext, browsePath, initialLoaded, loadFolder]);

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

  const refreshListing = () => {
    loadFolder(browsePath);
    router.refresh();
  };

  const patchBrowsePathItem = (previousId: string, next: { id: string; name: string }) => {
    setBrowsePath((prev) =>
      prev.map((segment) =>
        segment.id === previousId ? { id: next.id, name: next.name } : segment,
      ),
    );
  };

  if (!storageConfigured) {
    return (
      <Alert tone="info">
        {tStorage('errors.notConnected')}{' '}
        <Link href="/settings/storage" className="underline">
          {tStorage('connectAction')}
        </Link>
      </Alert>
    );
  }

  if (contextError) {
    return <Alert tone="danger">{contextError}</Alert>;
  }

  if (!browserContext) {
    return (
      <div className="relative min-h-[12rem]">
        <StorageLoadingOverlay label={t('loading')} />
      </div>
    );
  }

  const handleUpload = (file: File) => {
    if (!currentFolderId) return;
    startUpload(async () => {
      setError(null);
      const mime = normalizeUploadMime(file.type, file.name);
      if (!mime.ok) {
        setError(tAttach('uploadFailed'));
        return;
      }
      const prepared = await prepareDocumentUploadAction({
        fileName: file.name,
        mimeType: mime.mimeType,
        sizeBytes: file.size,
        ownerType: 'project',
        ownerId: projectId,
        label: inPhotosTree ? 'photo' : undefined,
        browserParentFolderId: currentFolderId,
      });
      if (prepared.error || !prepared.documentId || !prepared.uploadUrl) {
        setError(prepared.error ?? tAttach('uploadFailed'));
        return;
      }
      const uploaded = await uploadDocumentBytes(
        {
          uploadUrl: prepared.uploadUrl,
          uploadMode: prepared.uploadMode,
          uploadToken: prepared.uploadToken,
          uploadPath: prepared.uploadPath,
          uploadBucket: prepared.uploadBucket,
        },
        file,
        { contentType: mime.mimeType },
      );
      if (!uploaded.ok) {
        setError(tAttach('uploadFailed'));
        return;
      }
      const finalized = await finalizeDocumentUploadAction({
        documentId: prepared.documentId,
        sizeBytes: file.size,
      });
      if (finalized.error) {
        setError(finalized.error);
        return;
      }
      refreshListing();
    });
  };

  const openCreateFolderDialog = () => {
    setNameValue('');
    setNameError(null);
    setNameDialog({ kind: 'create' });
  };

  const openRenameDialog = (itemId: string, itemKind: 'file' | 'folder', currentName: string) => {
    setNameValue(currentName);
    setNameError(null);
    setNameDialog({ kind: 'rename', itemId, itemKind, currentName });
  };

  const submitNameDialog = async () => {
    if (!nameDialog || !nameValue.trim()) return;
    setNamePending(true);
    setNameError(null);
    try {
      if (nameDialog.kind === 'create') {
        if (!currentFolderId) return;
        const result = await createProjectSubfolderAction({
          projectId,
          parentFolderExternalId: currentFolderId,
          name: nameValue.trim(),
        });
        if (result.error) {
          setNameError(result.error);
          return;
        }
      } else {
        const result = await renameProjectStorageItemAction({
          projectId,
          itemId: nameDialog.itemId,
          itemKind: nameDialog.itemKind,
          name: nameValue.trim(),
        });
        if (result.error) {
          setNameError(result.error);
          return;
        }
        if (nameDialog.itemKind === 'folder' && result.item) {
          patchBrowsePathItem(nameDialog.itemId, {
            id: result.item.id,
            name: result.item.name,
          });
        }
      }
      setNameDialog(null);
      refreshListing();
    } finally {
      setNamePending(false);
    }
  };

  const openMoveDialog = async (
    itemId: string,
    itemKind: 'file' | 'folder',
    itemName: string,
  ) => {
    setMoveDialog({ itemId, itemKind, itemName });
    setMoveTargetId('');
    setMoveError(null);
    setMoveTargets([]);
    setMoveTargetsLoading(true);
    try {
      const result = await listProjectMoveTargetsAction({
        projectId,
        excludeFolderId: itemKind === 'folder' ? itemId : null,
      });
      if (result.error) {
        setMoveError(result.error);
        setMoveTargets([]);
        return;
      }
      setMoveTargets(result.targets ?? []);
    } finally {
      setMoveTargetsLoading(false);
    }
  };

  const submitMoveDialog = async () => {
    if (!moveDialog || !moveTargetId) return;
    setMovePending(true);
    setMoveError(null);
    try {
      const result = await moveProjectStorageItemAction({
        projectId,
        itemId: moveDialog.itemId,
        itemKind: moveDialog.itemKind,
        targetFolderExternalId: moveTargetId,
      });
      if (result.error) {
        setMoveError(result.error);
        return;
      }
      if (moveDialog.itemKind === 'folder' && result.item) {
        patchBrowsePathItem(moveDialog.itemId, {
          id: result.item.id,
          name: result.item.name,
        });
      }
      setMoveDialog(null);
      refreshListing();
    } finally {
      setMovePending(false);
    }
  };

  const submitDeleteDialog = async () => {
    if (!deleteDialog) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await deleteProjectStorageItemAction({
        projectId,
        itemId: deleteDialog.itemId,
        itemKind: deleteDialog.itemKind,
      });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteDialog(null);
      refreshListing();
    } finally {
      setDeletePending(false);
    }
  };

  const openFilePreview = (file: ProviderFileItem) => {
    setPreviewFile(file);
  };

  const openFileOnDevice = (file: ProviderFileItem) => {
    const url = buildStorageFileDownloadUrl({
      scope: 'project',
      projectId,
      fileId: file.id,
      disposition: 'attachment',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openFileInProvider = async (file: ProviderFileItem) => {
    const result = await getProjectFileProviderUrlAction({ projectId, fileId: file.id });
    if (result.error || !result.url) {
      setError(result.error ?? tErrors('fileUnavailable'));
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const shareStorageItem = (file: ProviderFileItem) => {
    setShareError(null);
    void shareFile({
      downloadUrl: buildStorageFileDownloadUrl({
        scope: 'project',
        projectId,
        fileId: file.id,
        disposition: 'attachment',
      }),
      filename: file.name,
      mimeType: file.mimeType ?? '',
    });
  };

  const breadcrumbTitle =
    browsePath.length === 0
      ? browserContext.projectRootFolderName
      : `${browserContext.projectRootFolderName} / ${browsePath.map((s) => s.name).join(' / ')}`;

  const isEmpty = folders.length === 0 && files.length === 0;
  const providerLabel = browserContext
    ? STORAGE_PROVIDER_LABELS[browserContext.provider]
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--pf-text-secondary)]">{t('shortcutsLabel')}</span>
        {browserContext.semanticShortcuts.map((shortcut) => (
          <Button
            key={shortcut.semanticFolderType}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => jumpToSemanticFolder(shortcut)}
          >
            {t(`folders.${shortcut.semanticFolderType}`)}
          </Button>
        ))}
      </div>

      <nav aria-label={t('breadcrumb')} className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
          onClick={() => navigateBreadcrumb(-1)}
        >
          {browserContext.projectRootFolderName}
        </button>
        {browsePath.map((segment, index) => (
          <span key={segment.id} className="flex items-center gap-1">
            <span className="text-[var(--pf-text-muted)]">/</span>
            <button
              type="button"
              className="text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
              onClick={() => navigateBreadcrumb(index)}
            >
              {segment.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        {browsePath.length > 0 ? (
          <Button type="button" size="sm" variant="secondary" onClick={goBack} disabled={loading}>
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            {t('back')}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={refreshListing} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {t('refresh')}
        </Button>
        {canManage ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => openFilePicker(fileInputRef.current)}
              disabled={uploading || loading}
            >
              {t('upload')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => openFilePicker(captureInputRef.current)}
              disabled={uploading || loading}
            >
              {t('capture')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={openCreateFolderDialog}
              disabled={loading}
            >
              {t('createFolder')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
            <input
              ref={captureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {shareError ? <Alert tone="danger">{shareError}</Alert> : null}

      <Card className="relative">
        {loading || uploading || sharing ? (
          <StorageLoadingOverlay
            label={sharing ? tPreview('sharePreparing') : loading ? t('loading') : tAttach('uploading')}
            blocking={uploading || sharing}
          />
        ) : null}
        <CardHeader>
          <CardTitle className="text-base">{breadcrumbTitle || currentFolderName}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty && !loading ? (
            <EmptyState size="sm" title={t('empty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {folders.map((folder) => (
                <BrowserRow
                  key={folder.id}
                  icon={<Folder className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />}
                  name={folder.name}
                  kind="folder"
                  meta="—"
                  canManage={canManage}
                  onOpen={() => openSubfolder(folder)}
                  onRename={() => openRenameDialog(folder.id, 'folder', folder.name)}
                  onMove={() => void openMoveDialog(folder.id, 'folder', folder.name)}
                  onDelete={() =>
                    setDeleteDialog({ itemId: folder.id, itemKind: 'folder', itemName: folder.name })
                  }
                  t={t}
                />
              ))}
              {files.map((file) => (
                <BrowserRow
                  key={file.id}
                  icon={<FileText className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />}
                  name={file.name}
                  kind="file"
                  meta={file.sizeBytes != null ? formatFileSize(file.sizeBytes, tFileSize) : '—'}
                  canManage={canManage}
                  onOpen={() => openFilePreview(file)}
                  onOpenOnDevice={() => openFileOnDevice(file)}
                  onOpenInProvider={() => void openFileInProvider(file)}
                  providerLabel={providerLabel}
                  onShare={() => shareStorageItem(file)}
                  onRename={() => openRenameDialog(file.id, 'file', file.name)}
                  onMove={() => void openMoveDialog(file.id, 'file', file.name)}
                  onDelete={() =>
                    setDeleteDialog({ itemId: file.id, itemKind: 'file', itemName: file.name })
                  }
                  t={t}
                  tPreview={tPreview}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.kind === 'create' ? t('createFolderTitle') : t('renameTitle')}
            </DialogTitle>
            {nameDialog?.kind === 'create' ? (
              <DialogDescription>{t('createFolderDescription')}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogBody>
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder={t('folderNamePlaceholder')}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNameDialog();
              }}
            />
            {nameError ? <Alert tone="danger">{nameError}</Alert> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setNameDialog(null)} disabled={namePending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void submitNameDialog()} loading={namePending} disabled={!nameValue.trim()}>
              {tCommon('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialog !== null} onOpenChange={(open) => !open && setMoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('moveTitle')}</DialogTitle>
            <DialogDescription>
              {moveDialog ? t('moveDescription', { name: moveDialog.itemName }) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Select
              value={moveTargetId}
              onValueChange={setMoveTargetId}
              disabled={moveTargetsLoading || moveTargets.length === 0}
            >
              <SelectTrigger aria-label={t('selectDestination')}>
                <SelectValue
                  placeholder={moveTargetsLoading ? t('loading') : t('selectDestination')}
                />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.pathLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {moveError ? <Alert tone="danger">{moveError}</Alert> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setMoveDialog(null)} disabled={movePending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void submitMoveDialog()} loading={movePending} disabled={!moveTargetId}>
              {t('move')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog !== null} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteDialog?.itemKind === 'folder' ? t('deleteFolderTitle') : t('deleteFileTitle')}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog?.itemKind === 'folder'
                ? t('deleteFolderDescription', { name: deleteDialog.itemName })
                : deleteDialog
                  ? t('deleteFileDescription', { name: deleteDialog.itemName })
                  : null}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <DialogBody>
              <Alert tone="danger">{deleteError}</Alert>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteDialog(null)} disabled={deletePending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void submitDeleteDialog()}
              loading={deletePending}
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          const url = buildStorageFileDownloadUrl({
            scope: 'project',
            projectId,
            fileId: target.fileId,
            disposition: 'attachment',
          });
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
        onOpenInProvider={(target) => {
          const file = files.find((item) => item.id === target.fileId);
          if (file) void openFileInProvider(file);
        }}
        provider={browserContext.provider}
      />
    </div>
  );
}

function BrowserRow({
  icon,
  name,
  kind,
  meta,
  canManage,
  onOpen,
  onOpenOnDevice,
  onOpenInProvider,
  providerLabel,
  onShare,
  onRename,
  onMove,
  onDelete,
  t,
  tPreview,
}: {
  icon: ReactNode;
  name: string;
  kind: 'file' | 'folder';
  meta: string;
  canManage: boolean;
  onOpen: () => void;
  onOpenOnDevice?: () => void;
  onOpenInProvider?: () => void;
  providerLabel?: string | null;
  onShare?: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations<'externalStorage.projectFiles'>>;
  tPreview?: ReturnType<typeof useTranslations<'externalStorage.preview'>>;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-start hover:underline"
        onClick={onOpen}
      >
        {icon}
        <span className="truncate">{name}</span>
        <span className="sr-only">{kind === 'folder' ? t('folderKind') : t('fileKind')}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[var(--pf-text-secondary)]">{meta}</span>
        {kind === 'file' || canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" aria-label={t('actions')}>
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {kind === 'file' && tPreview ? (
                <>
                  <DropdownMenuItem onSelect={onOpen}>{tPreview('title')}</DropdownMenuItem>
                  {onOpenOnDevice ? (
                    <DropdownMenuItem onSelect={onOpenOnDevice}>{tPreview('openOnDevice')}</DropdownMenuItem>
                  ) : null}
                  {onOpenInProvider && providerLabel ? (
                    <DropdownMenuItem onSelect={onOpenInProvider}>
                      {tPreview('openInProvider', { provider: providerLabel })}
                    </DropdownMenuItem>
                  ) : null}
                  {onShare ? (
                    <DropdownMenuItem onSelect={onShare}>{tPreview('share')}</DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={onRename}>{t('rename')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onMove}>{t('move')}</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-[var(--pf-action-danger)] focus:text-[var(--pf-action-danger)]"
                  >
                    {t('delete')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
