'use client';

import { ArrowRight, Folder, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type {
  ProjectCloudFileBrowserActions,
  ProjectCloudFileBrowserContext,
} from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { INFRA_TEXT } from './texts';

interface Segment {
  readonly id: string;
  readonly name: string;
}

interface FolderItem {
  readonly id: string;
  readonly name: string;
}

/**
 * Picks an EXISTING folder in the organization's connected cloud (project scope). Reuses the
 * project file browser actions; only folders are listed and the current folder is the choice.
 */
export function InfraFolderPicker({
  projectId,
  open,
  onOpenChange,
  browserActions,
  title,
  description,
  onSelect,
}: {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly browserActions: ProjectCloudFileBrowserActions;
  readonly title?: string;
  readonly description?: string;
  readonly onSelect: (folder: { id: string; name: string }) => void | Promise<void>;
}) {
  const [context, setContext] = useState<ProjectCloudFileBrowserContext | null>(null);
  const [path, setPath] = useState<readonly Segment[]>([]);
  const [folders, setFolders] = useState<readonly FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  const browse = useCallback(
    async (next: readonly Segment[], rootId: string) => {
      setLoading(true);
      setError(null);
      const segment = next[next.length - 1] ?? null;
      const result = await browserActions.browseFolder({
        projectId,
        folderExternalId: segment?.id ?? rootId,
        folderName: segment?.name ?? null,
      });
      setLoading(false);
      if (result.error) {
        setError(result.error);
        setFolders([]);
        return;
      }
      setPath(next);
      setFolders((result.folders ?? []).map((folder) => ({ id: folder.id, name: folder.name })));
    },
    [browserActions, projectId],
  );

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await browserActions.loadInitial(projectId);
      if (cancelled) return;
      setLoading(false);
      if (result.error || !result.context) {
        setError(result.error ?? INFRA_TEXT.retry);
        return;
      }
      setContext(result.context);
      setPath([]);
      setFolders((result.folders ?? []).map((folder) => ({ id: folder.id, name: folder.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, browserActions, projectId]);

  const currentId = path[path.length - 1]?.id ?? context?.projectRootFolderId ?? null;
  const currentName = path[path.length - 1]?.name ?? context?.projectRootFolderName ?? '';

  async function choose() {
    if (!currentId) return;
    setSubmitting(true);
    try {
      await onSelect({ id: currentId, name: currentName });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-lg" data-testid="infra-folder-picker">
        <DialogHeader>
          <DialogTitle>{title ?? INFRA_TEXT.locations.linkTitle}</DialogTitle>
          <DialogDescription>{description ?? INFRA_TEXT.locations.linkDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {context ? (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {path.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => void browse(path.slice(0, -1), context.projectRootFolderId)}
                  >
                    <ArrowRight className="rotate-180" aria-hidden />
                    {INFRA_TEXT.locations.back}
                  </Button>
                ) : null}
                <nav className="flex min-w-0 flex-1 flex-wrap gap-1 text-sm" aria-label={INFRA_TEXT.locations.foldersTitle}>
                  <button type="button" className="truncate text-[var(--pf-text-secondary)] hover:underline" onClick={() => void browse([], context.projectRootFolderId)}>
                    {context.projectRootFolderName}
                  </button>
                  {path.map((segment, index) => (
                    <span key={segment.id} className="flex min-w-0 items-center gap-1">
                      <span className="text-[var(--pf-text-secondary)]">/</span>
                      <button
                        type="button"
                        className="truncate hover:underline"
                        onClick={() => void browse(path.slice(0, index + 1), context.projectRootFolderId)}
                      >
                        {segment.name}
                      </button>
                    </span>
                  ))}
                </nav>
              </div>
              <div className="relative max-h-[40dvh] min-h-24 overflow-y-auto rounded-md border border-[var(--pf-border-default)] p-1">
                {loading ? (
                  <div className="flex justify-center py-6" role="status">
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  </div>
                ) : folders.length === 0 ? (
                  <p className="p-4 text-center text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.locations.emptyFolder}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {folders.map((folder) => (
                      <li key={folder.id}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-[var(--pf-bg-muted)]"
                          onClick={() => void browse([...path, { id: folder.id, name: folder.name }], context.projectRootFolderId)}
                        >
                          <Folder className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : loading ? (
            <div className="flex justify-center py-8" role="status">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => void choose()} disabled={!currentId || loading || submitting} data-testid="infra-folder-choose">
            {INFRA_TEXT.locations.linkChoose}
            {currentName ? ` (${currentName})` : ''}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {INFRA_TEXT.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
