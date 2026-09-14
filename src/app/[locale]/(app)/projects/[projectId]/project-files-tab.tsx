'use client';

import { Folder, FileText, MoreHorizontal } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import {
  PROJECT_SEMANTIC_FOLDERS,
  type ProviderFileItem,
  type ProviderFolderItem,
  type SemanticFolderType,
} from '@/modules/external-storage/client';
import {
  prepareDocumentUploadAction,
  finalizeDocumentUploadAction,
} from '@/modules/documents/application/document-actions';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import {
  browseProjectFolderAction,
  createProjectSubfolderAction,
  deleteProjectStorageItemAction,
  getProjectFileDownloadAction,
  listProjectMoveTargetsAction,
  moveProjectStorageItemAction,
  renameProjectStorageItemAction,
} from './project-files-actions';

type BrowseSegment = { readonly id: string; readonly name: string };

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
  const tStorage = useTranslations('externalStorage');
  const tErrors = useTranslations('externalStorage.errors');
  const tFileSize = useTranslations('documents.fileSize');
  const tAttach = useTranslations('documents.attachments');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const [activeFolder, setActiveFolder] = useState<SemanticFolderType>('documents');
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

  const loadFolder = useCallback(
    (semanticFolder: SemanticFolderType, path: readonly BrowseSegment[] = []) => {
      startLoad(async () => {
        setError(null);
        const folderExternalId = path.length > 0 ? path[path.length - 1]!.id : undefined;
        const result = await browseProjectFolderAction({
          projectId,
          semanticFolderType: semanticFolder,
          folderExternalId,
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
    [projectId],
  );

  useEffect(() => {
    loadFolder(activeFolder, browsePath);
  }, [activeFolder, browsePath, loadFolder]);

  const switchSemanticFolder = (folder: SemanticFolderType) => {
    setActiveFolder(folder);
    setBrowsePath([]);
  };

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

  const refreshListing = () => {
    loadFolder(activeFolder, browsePath);
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
        label: activeFolder === 'photos' ? 'photo' : undefined,
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

  const previewFile = async (fileId: string) => {
    const result = await getProjectFileDownloadAction({ projectId, fileId });
    if (result.error || !result.url) {
      setError(result.error ?? tErrors('fileUnavailable'));
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const breadcrumbLabel =
    browsePath.length === 0
      ? t(`folders.${activeFolder}`)
      : `${t(`folders.${activeFolder}`)} / ${browsePath.map((s) => s.name).join(' / ')}`;

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PROJECT_SEMANTIC_FOLDERS.map((folder) => (
          <Button
            key={folder}
            type="button"
            size="sm"
            variant={activeFolder === folder ? 'primary' : 'secondary'}
            onClick={() => switchSemanticFolder(folder)}
          >
            {t(`folders.${folder}`)}
          </Button>
        ))}
      </div>

      <nav aria-label={t('breadcrumb')} className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="text-[var(--pf-text-link)] underline-offset-2 hover:underline"
          onClick={() => navigateBreadcrumb(-1)}
        >
          {t(`folders.${activeFolder}`)}
        </button>
        {browsePath.map((segment, index) => (
          <span key={segment.id} className="flex items-center gap-1">
            <span className="text-[var(--pf-text-muted)]">/</span>
            <button
              type="button"
              className="text-[var(--pf-text-link)] underline-offset-2 hover:underline"
              onClick={() => navigateBreadcrumb(index)}
            >
              {segment.name}
            </button>
          </span>
        ))}
      </nav>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => openFilePicker(fileInputRef.current)} disabled={uploading}>
            {t('upload')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => openFilePicker(captureInputRef.current)}
            disabled={uploading}
          >
            {t('capture')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={openCreateFolderDialog} disabled={loading}>
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
        </div>
      ) : null}

      {loading || uploading ? <Spinner label={loading ? t('loading') : tAttach('uploading')} /> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{breadcrumbLabel || currentFolderName}</CardTitle>
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
                  meta="—"
                  canManage={canManage}
                  onOpen={() => openSubfolder(folder)}
                  onRename={() => openRenameDialog(folder.id, 'folder', folder.name)}
                  onMove={() => void openMoveDialog(folder.id, 'folder', folder.name)}
                  onDelete={() => setDeleteDialog({ itemId: folder.id, itemKind: 'folder', itemName: folder.name })}
                  t={t}
                />
              ))}
              {files.map((file) => (
                <BrowserRow
                  key={file.id}
                  icon={<FileText className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />}
                  name={file.name}
                  meta={file.sizeBytes != null ? formatFileSize(file.sizeBytes, tFileSize) : '—'}
                  canManage={canManage}
                  onOpen={() => void previewFile(file.id)}
                  onRename={() => openRenameDialog(file.id, 'file', file.name)}
                  onMove={() => void openMoveDialog(file.id, 'file', file.name)}
                  onDelete={() => setDeleteDialog({ itemId: file.id, itemKind: 'file', itemName: file.name })}
                  t={t}
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
    </div>
  );
}

function BrowserRow({
  icon,
  name,
  meta,
  canManage,
  onOpen,
  onRename,
  onMove,
  onDelete,
  t,
}: {
  icon: ReactNode;
  name: string;
  meta: string;
  canManage: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations<'externalStorage.projectFiles'>>;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-start hover:underline"
        onClick={onOpen}
      >
        {icon}
        <span className="truncate">{name}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[var(--pf-text-secondary)]">{meta}</span>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" aria-label={t('actions')}>
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}>{t('rename')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onMove}>{t('move')}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-[var(--pf-action-danger)] focus:text-[var(--pf-action-danger)]"
              >
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
