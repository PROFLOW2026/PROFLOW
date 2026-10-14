'use client';

import { ArrowRightLeft, Copy, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  duplicateTaskAction,
  listTaskTransferTargetsAction,
  moveTaskToProjectAction,
} from '@/app/[locale]/(app)/work/actions';
import type { TaskTransferProjectOption } from '@/modules/tasks/application/list-task-transfer-targets';

type Mode = 'move' | 'copy';

export function TaskMoveCopyDialog({
  taskId,
  currentProjectId,
  open,
  onOpenChange,
}: {
  taskId: string;
  currentProjectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('tasks.actions.moveCopyDialog');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('move');
  const [targets, setTargets] = useState<TaskTransferProjectOption[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [includeAssignees, setIncludeAssignees] = useState(true);
  const [copyDates, setCopyDates] = useState(true);
  const [confirmAssignees, setConfirmAssignees] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dialog state when opened
    setError(null);
    setLoadingTargets(true);
    void listTaskTransferTargetsAction()
      .then((rows) => setTargets(rows))
      .finally(() => setLoadingTargets(false));
  }, [open]);

  const selectedProject = useMemo(
    () => targets.find((row) => row.id === projectId) ?? null,
    [targets, projectId],
  );

  const selectedBoard = useMemo(
    () => selectedProject?.boards.find((row) => row.id === boardId) ?? null,
    [selectedProject, boardId],
  );

  useEffect(() => {
    if (!selectedProject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset board/bucket when project selection clears
      setBoardId('');
      setBucketId('');
      return;
    }
    const defaultBoard = selectedProject.boards[0];
    setBoardId(defaultBoard?.id ?? '');
    setBucketId(defaultBoard?.buckets[0]?.id ?? '');
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedBoard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset bucket when board selection clears
      setBucketId('');
      return;
    }
    if (!selectedBoard.buckets.some((bucket) => bucket.id === bucketId)) {
      setBucketId(selectedBoard.buckets[0]?.id ?? '');
    }
  }, [selectedBoard, bucketId]);

  const run = () => {
    if (!projectId) {
      setError(t('pickProject'));
      return;
    }
    if (mode === 'move' && projectId === currentProjectId) {
      setError(t('sameProject'));
      return;
    }

    startTransition(async () => {
      setError(null);
      if (mode === 'move') {
        const result = await moveTaskToProjectAction(taskId, {
          targetProjectId: projectId,
          targetBoardId: boardId || null,
          targetBucketId: bucketId || null,
          confirmRemoveInaccessibleAssignees: confirmAssignees,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await duplicateTaskAction(taskId, {
        targetProjectId: projectId,
        includeAssignees,
        copyDates,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      if (result.newTaskId) {
        router.push(`/tasks/${result.newTaskId}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'move' ? t('moveTitle') : t('copyTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'move' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('move')}
            >
              <ArrowRightLeft className="size-3.5" aria-hidden />
              {t('move')}
            </Button>
            <Button
              type="button"
              variant={mode === 'copy' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('copy')}
            >
              <Copy className="size-3.5" aria-hidden />
              {t('copy')}
            </Button>
          </div>

          {loadingTargets ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-[var(--pf-text-muted)]" />
            </div>
          ) : targets.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('noProjects')}</p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t('project')}</span>
                <select
                  className="h-10 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={isPending}
                >
                  <option value="">{t('pickProject')}</option>
                  {targets.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedProject && selectedProject.boards.length > 0 ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{t('board')}</span>
                  <select
                    className="h-10 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2"
                    value={boardId}
                    onChange={(event) => setBoardId(event.target.value)}
                    disabled={isPending}
                  >
                    {selectedProject.boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {selectedBoard && selectedBoard.buckets.length > 0 ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{t('column')}</span>
                  <select
                    className="h-10 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2"
                    value={bucketId}
                    onChange={(event) => setBucketId(event.target.value)}
                    disabled={isPending}
                  >
                    {selectedBoard.buckets.map((bucket) => (
                      <option key={bucket.id} value={bucket.id}>
                        {bucket.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}

          {mode === 'copy' ? (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeAssignees}
                  onCheckedChange={(value) => setIncludeAssignees(value === true)}
                  disabled={isPending}
                />
                {t('includeAssignees')}
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={copyDates}
                  onCheckedChange={(value) => setCopyDates(value === true)}
                  disabled={isPending}
                />
                {t('copyDates')}
              </label>
            </div>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmAssignees}
                onCheckedChange={(value) => setConfirmAssignees(value === true)}
                disabled={isPending}
              />
              <span>{t('confirmAssignees')}</span>
            </label>
          )}

          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button type="button" loading={isPending} onClick={run}>
              {mode === 'move' ? t('confirmMove') : t('confirmCopy')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
