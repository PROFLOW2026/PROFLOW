'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { beginCaptureAction } from '../actions';
import {
  MAX_UPLOAD_ATTEMPTS,
  approve as approveItem,
  cancel as cancelItem,
  failUpload,
  finishUpload,
  hasUnsavedWork,
  newQueueItem,
  nextUploadable,
  queueSummary,
  retry as retryItem,
  startUpload,
  type QueueDetails,
  type QueueItem,
} from '../domain/upload-queue';
import type { InfraViewer } from '../domain/types';
import { newClientId, normalizeUploadMime, uploadBytes } from './infra-client';

interface Context {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly taskId: string | null;
  /** Called after a photo reached the cloud (refresh the gallery). */
  readonly onUploaded?: (captureId: string) => void;
}

/**
 * Capture -> approve -> upload queue for the UI. The pure state machine (`domain/upload-queue`)
 * guarantees an unapproved photo is never uploaded; this hook only schedules the approved ones,
 * keeps shooting independent from uploading, retries failures and guards unsaved work.
 */
export function useInfraUploads(context: Context) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const files = useRef(new Map<string, File>());
  const capturedAt = useRef(new Map<string, string>());
  const started = useRef(new Set<string>());
  const urlRegistry = useRef(new Map<string, string>());
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  const patch = useCallback((clientId: string, update: (item: QueueItem) => QueueItem) => {
    setItems((current) => current.map((item) => (item.clientId === clientId ? update(item) : item)));
  }, []);

  const add = useCallback(
    (file: File, input: { locationId: string | null; source: QueueItem['source']; details?: Partial<QueueDetails> }) => {
      const clientId = newClientId();
      files.current.set(clientId, file);
      capturedAt.current.set(clientId, new Date().toISOString());
      const url = URL.createObjectURL(file);
      urlRegistry.current.set(clientId, url);
      setPreviews((current) => ({ ...current, [clientId]: url }));
      setItems((current) => [...current, newQueueItem({ clientId, ...input })]);
      return clientId;
    },
    [],
  );

  const release = useCallback((clientId: string) => {
    files.current.delete(clientId);
    capturedAt.current.delete(clientId);
    started.current.delete(clientId);
    const registered = urlRegistry.current.get(clientId);
    if (registered) URL.revokeObjectURL(registered);
    urlRegistry.current.delete(clientId);
    setPreviews((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }, []);

  /** Edits details / location of a photo that is still waiting for approval. */
  const edit = useCallback(
    (clientId: string, update: { locationId?: string | null; details?: Partial<QueueDetails> }) => {
      patch(clientId, (item) =>
        item.status === 'pending_approval'
          ? {
              ...item,
              locationId: update.locationId === undefined ? item.locationId : update.locationId,
              details: { ...item.details, ...update.details },
            }
          : item,
      );
    },
    [patch],
  );

  const approve = useCallback((clientId: string) => patch(clientId, approveItem), [patch]);

  /** Retake / cancel: the photo is dropped and never uploaded. */
  const discard = useCallback(
    (clientId: string) => {
      patch(clientId, cancelItem);
      release(clientId);
      setItems((current) => current.filter((item) => item.clientId !== clientId || item.status === 'uploading'));
    },
    [patch, release],
  );

  const retry = useCallback(
    (clientId: string) => {
      started.current.delete(clientId);
      patch(clientId, retryItem);
    },
    [patch],
  );

  /** Removes finished rows from the list (the photo stays in the cloud and the gallery). */
  const dismiss = useCallback(
    (clientId: string) => {
      release(clientId);
      setItems((current) => current.filter((item) => item.clientId !== clientId));
    },
    [release],
  );

  const run = useCallback(
    async (item: QueueItem) => {
      const file = files.current.get(item.clientId);
      const ctx = contextRef.current;
      if (!file || !item.locationId) {
        patch(item.clientId, (current) => failUpload(current, 'הקובץ אינו זמין יותר. צלמו שוב.'));
        return;
      }
      const mimeType = normalizeUploadMime(file, file.name);
      const begin = await beginCaptureAction(ctx.viewer, {
        projectId: ctx.projectId,
        organizationId: ctx.viewer === 'external' ? ctx.organizationId : null,
        locationId: item.locationId,
        clientCaptureId: item.clientId,
        taskId: ctx.taskId,
        source: item.source,
        capturedAt: capturedAt.current.get(item.clientId) ?? null,
        file: { fileName: file.name || 'photo.jpg', mimeType, sizeBytes: file.size },
        details: {
          description: item.details.description,
          room: item.details.room,
          wall: item.details.wall,
          infraType: (item.details.infraType || null) as never,
          dimensions: item.details.dimensions,
          note: item.details.note,
          role: item.details.role,
        },
      });
      if (!begin.ok) {
        patch(item.clientId, (current) => failUpload(current, begin.error));
        return;
      }
      if (!begin.data.alreadyUploaded) {
        const upload = await uploadBytes(begin.data.uploadUrl, file, mimeType);
        if (!upload.ok) {
          patch(item.clientId, (current) => {
            const failed = failUpload(current, upload.error ?? 'ההעלאה נכשלה.');
            return upload.permanent ? { ...failed, attempts: MAX_UPLOAD_ATTEMPTS } : failed;
          });
          return;
        }
      }
      patch(item.clientId, (current) => finishUpload(current, begin.data.captureId));
      ctx.onUploaded?.(begin.data.captureId);
    },
    [patch],
  );

  // Start every approved photo (up to the concurrency limit). Shooting never waits for this.
  useEffect(() => {
    const ready = nextUploadable(items).filter((item) => !started.current.has(item.clientId));
    if (ready.length === 0) return;
    for (const item of ready) started.current.add(item.clientId);
    setItems((current) =>
      current.map((item) => (ready.some((candidate) => candidate.clientId === item.clientId) ? startUpload(item) : item)),
    );
    for (const item of ready) void run(startUpload(item));
  }, [items, run]);

  // Back online: retry uploads that failed because of the connection.
  useEffect(() => {
    const onOnline = () => {
      setItems((current) =>
        current.map((item) => {
          if (item.status !== 'failed') return item;
          started.current.delete(item.clientId);
          return retryItem(item);
        }),
      );
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Leaving with photos that are not in the cloud yet would lose them.
  const unsaved = hasUnsavedWork(items);
  useEffect(() => {
    if (!unsaved) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved]);

  useEffect(() => {
    const urls = urlRegistry.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const summary = useMemo(() => queueSummary(items), [items]);
  return { items, previews, summary, unsaved, add, edit, approve, discard, retry, dismiss } as const;
}
