'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pressableClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { indexLocalFiles, isDrawingName, type IndexedLocalFile, type LocalFileRow } from '../domain/local-files';
import { manualChoiceKey } from '../domain/identity';
import { PART_SIZE } from '../domain/session-rules';
import { ExternalReview } from './external-review';
import type { InflatedZipFile } from '../domain/inflate-zip';
import { zipEntryAllowed } from '../domain/zip-policy';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inflateInWorker(bytes: Uint8Array): Promise<InflatedZipFile[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zip.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ ok: boolean; files?: InflatedZipFile[]; message?: string }>) => {
      worker.terminate();
      if (!event.data.ok || !event.data.files) reject(new Error(event.data.message ?? 'zip_failed'));
      else resolve(event.data.files);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('zip_failed'));
    };
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    worker.postMessage(copy, [copy]);
  });
}

const Viewer = dynamic(
  () => import('@/modules/external-storage/ui/cad/pf-dwg-versioned-viewer').then((mod) => mod.PfDwgVersionedViewer),
  { ssr: false },
);

function firstHostId(list: readonly LocalFileRow[]): string | null {
  const drawing = list.find((row) => isDrawingName(row.name));
  return drawing?.logicalId ?? list[0]?.logicalId ?? null;
}

function resetFileInput(input: HTMLInputElement | null) {
  if (input) input.value = '';
}

/** Snapshot first: FileList is live, and clearing the input empties it. */
function takeInputFiles(input: HTMLInputElement): File[] {
  const files = Array.from(input.files ?? []);
  resetFileInput(input);
  return files;
}

const fileAccept = '.dwg,.dxf,.pdf,.ctb,.zip';

export function ExternalToolsHome({
  canView,
  canTakeoff,
  wasmReady,
}: {
  canView: boolean;
  canTakeoff: boolean;
  wasmReady: boolean;
}) {
  const [rows, setRows] = useState<LocalFileRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'view' | 'takeoff' | null>(null);
  const [reports, setReports] = useState<readonly { blockName: string; savedPath: string }[]>([]);
  const [choices, setChoices] = useState<
    readonly { parentLogicalId: string; blockName: string; savedPath: string; logicalId: string }[]
  >([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const viewFilesRef = useRef<HTMLInputElement>(null);
  const viewFolderRef = useRef<HTMLInputElement>(null);
  const takeoffFilesRef = useRef<HTMLInputElement>(null);
  const takeoffFolderRef = useRef<HTMLInputElement>(null);
  const indexed = useMemo(() => indexLocalFiles(rows), [rows]);
  const collisions = indexed.some((row) => row.ambiguous);

  async function collectFiles(list: FileList | File[]): Promise<LocalFileRow[]> {
    const next: LocalFileRow[] = [];
    for (const file of Array.from(list)) {
      const relativePath = file.webkitRelativePath || file.name;
      const archive = file.name.toLowerCase().endsWith('.zip');
      if (!zipEntryAllowed(relativePath) || (!archive && !isDrawingName(file.name))) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith('.zip')) {
        let inflated: InflatedZipFile[] = [];
        try {
          inflated = await inflateInWorker(bytes);
        } catch {
          setNotice('לא ניתן לפתוח את הארכיון.');
          continue;
        }
        for (const entry of inflated) {
          next.push({
            logicalId: crypto.randomUUID(),
            relativePath: entry.name,
            name: entry.name.split(/[\\/]/).pop() || entry.name,
            bytes: entry.bytes,
          });
        }
        continue;
      }
      next.push({ logicalId: crypto.randomUUID(), relativePath, name: file.name, bytes });
    }
    return next;
  }

  function openHost(logicalId: string, source = rows) {
    const row = source.find((item) => item.logicalId === logicalId);
    if (!row) return;
    const copy = row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([copy]));
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setHostId(logicalId);
  }

  async function loadRows(list: FileList | File[]): Promise<LocalFileRow[]> {
    const next = await collectFiles(list);
    setRows(next);
    setHostId(null);
    setChoices([]);
    setReports([]);
    setReviewSessionId(null);
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    return next;
  }

  async function startView(list?: FileList | File[]) {
    if (!canView || busy) return;
    setBusy('view');
    setNotice(null);
    try {
      const source = list ? await loadRows(list) : rows;
      const nextHost = firstHostId(source);
      if (!nextHost) {
        setNotice('בחרו תוכנית DWG, DXF או PDF לצפייה.');
        return;
      }
      openHost(nextHost, source);
    } finally {
      setBusy(null);
    }
  }

  async function runTakeoff(
    source: LocalFileRow[],
    nextHostId: string,
    xrefChoices: typeof choices,
  ) {
    setNotice('פותחים סשן זמני...');
    const response = await fetch('/api/tools/external/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ choices: xrefChoices }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; sessionId?: string } | null;
    if (response.status === 503 || payload?.error === 'migration_required') {
      setNotice('סשן הניתוח מחכה לאישור SQL של מיגרציה 0217. לא נוצרה שורה.');
      return;
    }
    if (!response.ok || !payload?.sessionId) {
      setNotice('פתיחת הסשן נכשלה.');
      return;
    }
    const sessionId = payload.sessionId;
    for (const row of source) {
      const fileResponse = await fetch(`/api/tools/external/sessions/${sessionId}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          logicalId: row.logicalId,
          relativePath: row.relativePath,
          role: row.logicalId === nextHostId ? 'host' : 'xref',
          size: row.bytes.byteLength,
        }),
      });
      if (!fileResponse.ok) {
        setNotice('רישום הקבצים נכשל. לא הופעל ניתוח.');
        return;
      }
    }
    for (const choice of xrefChoices) {
      const choiceResponse = await fetch(`/api/tools/external/sessions/${sessionId}/xrefs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(choice),
      });
      if (!choiceResponse.ok) {
        setNotice('שמירת הבחירה נכשלה. לא הופעל ניתוח.');
        return;
      }
    }
    for (const row of source) {
      const hash = await sha256Hex(row.bytes);
      const partTotal = Math.max(1, Math.ceil(row.bytes.byteLength / PART_SIZE));
      for (let index = 0; index < partTotal; index += 1) {
        const slice = row.bytes.subarray(index * PART_SIZE, (index + 1) * PART_SIZE);
        const copy = new Uint8Array(slice.byteLength);
        copy.set(slice);
        const partResponse = await fetch(
          `/api/tools/external/sessions/${sessionId}/files/${row.logicalId}/part?partIndex=${index}`,
          { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: new Blob([copy]) },
        );
        if (!partResponse.ok) {
          setNotice('העלאת חלק נכשלה. לא הופעל ניתוח.');
          return;
        }
      }
      const completeResponse = await fetch(`/api/tools/external/sessions/${sessionId}/files/${row.logicalId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sha256: hash }),
      });
      if (!completeResponse.ok) {
        setNotice('אימות הקובץ נכשל. לא הופעל ניתוח.');
        return;
      }
    }
    const analyzeResponse = await fetch(`/api/tools/external/sessions/${sessionId}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    if (!analyzeResponse.ok) {
      setNotice('הקבצים ננעלו, והשיגור לניתוח נכשל.');
      return;
    }
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const review = await fetch(`/api/tools/external/sessions/${sessionId}/review`);
      if (review.ok) {
        ready = true;
        break;
      }
      if (attempt === 0 || attempt % 5 === 0) setNotice('הניתוח רץ. הסקירה נפתחת כשהתוצאה נשמרת.');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (ready) {
      setReviewSessionId(sessionId);
      setNotice('התוצאה נקלטת. מסך הסקירה הקיים מציג את הגיליונות ואת כתב הכמויות.');
    } else {
      setNotice('הקבצים ננעלו והניתוח שוגר. מסך הסקירה נפתח רק אחרי קליטת תוצאה מאומתת.');
    }
  }

  async function startTakeoff(list?: FileList | File[]) {
    if (!canTakeoff || busy) return;
    setBusy('takeoff');
    setNotice(null);
    try {
      const source = list ? await loadRows(list) : rows;
      const nextHost = firstHostId(source);
      if (!nextHost) {
        setNotice('בחרו תוכנית כדי להפיק כתב כמויות.');
        return;
      }
      setHostId(nextHost);
      await runTakeoff(source, nextHost, list ? [] : choices);
    } finally {
      setBusy(null);
    }
  }

  function onViewCardClick() {
    if (rows.length > 0) {
      void startView();
      return;
    }
    viewFilesRef.current?.click();
  }

  function onTakeoffCardClick() {
    if (rows.length > 0) {
      void startTakeoff();
      return;
    }
    takeoffFilesRef.current?.click();
  }

  const visibleIndex = wasmReady ? indexed : indexed.filter((row) => !row.ambiguous);
  const viewerFiles = useMemo(
    () =>
      visibleIndex.map((row) => {
        const source = rows.find((item) => item.logicalId === row.logicalId);
        return {
          name: row.relativePath,
          logicalId: row.logicalId,
          sizeBytes: row.size,
          getBytes: async () => source?.bytes ?? new Uint8Array(),
        };
      }),
    [rows, visibleIndex],
  );

  function candidatesFor(savedPath: string, blockName: string): IndexedLocalFile[] {
    const saved = savedPath.trim();
    const base = (saved || blockName).split(/[\\/]/).pop()?.toLowerCase() ?? '';
    const exact = indexed.filter((row) => saved.length > 0 && row.relativePath.replace(/\\/g, '/').toLowerCase() === saved.toLowerCase());
    if (exact.length === 1) return [];
    const named = indexed.filter((row) => base.length > 0 && row.name.toLowerCase() === base);
    if (named.length === 1) return [];
    if (named.length > 1) return named;
    return indexed;
  }

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const actionCardClass = cn(
    pressableClassName,
    'flex min-h-28 w-full min-w-0 flex-col items-stretch gap-1 rounded-lg border p-4 text-start',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
    'disabled:pointer-events-none disabled:opacity-60',
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden" dir="rtl">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold">כלים מקצועיים</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">שתי פעולות נפרדות: צפייה בתוכנית, או הפקת כתב כמויות.</p>
      </header>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        {canView ? (
          <section
            className="min-w-0"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) void startView(event.dataTransfer.files);
            }}
          >
            <button
              type="button"
              data-pf="external-tools-view"
              className={cn(
                actionCardClass,
                'border-[var(--pf-border-strong)] bg-[var(--pf-action-secondary)] text-[var(--pf-text-primary)]',
                'hover:bg-[var(--pf-action-secondary-hover)] active:bg-[var(--pf-action-secondary-active)]',
              )}
              disabled={busy !== null}
              aria-busy={busy === 'view' || undefined}
              onClick={onViewCardClick}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                {busy === 'view' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                פתיחת תוכנית לצפייה
              </span>
              <span className="text-sm font-normal text-[var(--pf-text-secondary)]">
                הקובץ נשאר במכשיר. אין העלאה ואין פרויקט.
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              className="mt-1"
              disabled={busy !== null}
              onClick={() => viewFolderRef.current?.click()}
            >
              בחירת תיקייה לצפייה
            </Button>
            <input
              ref={viewFilesRef}
              className="sr-only"
              type="file"
              multiple
              accept={fileAccept}
              onChange={(event) => {
                const files = takeInputFiles(event.target);
                if (files.length > 0) void startView(files);
              }}
            />
            <input
              ref={viewFolderRef}
              className="sr-only"
              type="file"
              multiple
              {...{ webkitdirectory: '', directory: '' }}
              onChange={(event) => {
                const files = takeInputFiles(event.target);
                if (files.length > 0) void startView(files);
              }}
            />
          </section>
        ) : null}
        {canTakeoff ? (
          <section
            className="min-w-0"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) void startTakeoff(event.dataTransfer.files);
            }}
          >
            <button
              type="button"
              data-pf="external-tools-takeoff"
              className={cn(
                actionCardClass,
                'border-transparent bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]',
                'hover:bg-[var(--pf-action-primary-hover)] active:bg-[var(--pf-action-primary-active)]',
              )}
              disabled={busy !== null}
              aria-busy={busy === 'takeoff' || undefined}
              onClick={onTakeoffCardClick}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                {busy === 'takeoff' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                הפקת כתב כמויות
              </span>
              <span className="text-sm font-normal opacity-90">ניתוח זמני לשש שעות, בלי שורה בפרויקט.</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              className="mt-1"
              disabled={busy !== null}
              onClick={() => takeoffFolderRef.current?.click()}
            >
              בחירת תיקייה לכתב כמויות
            </Button>
            <input
              ref={takeoffFilesRef}
              className="sr-only"
              type="file"
              multiple
              accept={fileAccept}
              onChange={(event) => {
                const files = takeInputFiles(event.target);
                if (files.length > 0) void startTakeoff(files);
              }}
            />
            <input
              ref={takeoffFolderRef}
              className="sr-only"
              type="file"
              multiple
              {...{ webkitdirectory: '', directory: '' }}
              onChange={(event) => {
                const files = takeInputFiles(event.target);
                if (files.length > 0) void startTakeoff(files);
              }}
            />
          </section>
        ) : null}
      </div>
      {hostId
        ? reports.map((row) => {
            const options = candidatesFor(row.savedPath, row.blockName);
            if (options.length === 0) return null;
            const key = manualChoiceKey({ parentLogicalId: hostId, blockName: row.blockName, savedPath: row.savedPath });
            return (
              <label key={key} className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="break-words">
                  בחירת רקע: {row.blockName} {row.savedPath ? `(${row.savedPath})` : '(נתיב ריק)'}
                </span>
                <select
                  className="min-h-11 max-w-full"
                  value={choices.find((choice) => manualChoiceKey(choice) === key)?.logicalId ?? ''}
                  onChange={(event) => {
                    const logicalId = event.target.value;
                    setChoices((current) => [
                      ...current.filter((choice) => manualChoiceKey(choice) !== key),
                      ...(logicalId
                        ? [{ parentLogicalId: hostId, blockName: row.blockName, savedPath: row.savedPath, logicalId }]
                        : []),
                    ]);
                  }}
                >
                  <option value="">בחרו קובץ. אין בחירה אוטומטית.</option>
                  {options.map((option) => (
                    <option key={option.logicalId} value={option.logicalId}>
                      {option.name} — {option.relativePath}
                    </option>
                  ))}
                </select>
              </label>
            );
          })
        : null}
      {collisions ? (
        <p className="min-w-0 text-sm text-[var(--pf-text-secondary)]">
          גרסה 3 הקפואה לא מבדילה בין קבצים באותו שם, והם לא נשלחים אליה.
        </p>
      ) : null}
      {indexed.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2">
          {indexed.map((row) => (
            <li key={row.logicalId} className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
              <p className="break-words text-sm">{row.relativePath}</p>
              {canView ? (
                <Button type="button" variant="secondary" className="mt-2" onClick={() => openHost(row.logicalId)}>
                  פתיחה לצפייה
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
      {reviewSessionId ? (
        <ExternalReview
          sessionId={reviewSessionId}
          hostBytes={rows.find((row) => row.logicalId === hostId)?.bytes ?? rows[0]?.bytes ?? null}
          hostLogicalId={hostId ?? undefined}
          indexedFiles={viewerFiles}
          xrefChoices={choices}
        />
      ) : null}
      {blobUrl && hostId ? (
        <div className="flex h-[min(70dvh,32rem)] min-h-[420px] min-w-0 flex-col overflow-hidden">
          <Viewer
            url={blobUrl}
            fileName={rows.find((row) => row.logicalId === hostId)?.name ?? 'plan.dwg'}
            reloadKey={1}
            onRetry={() => undefined}
            scope="org"
            wasmBaseUrl={wasmReady ? '/pf-cad/external/wasm' : undefined}
            hostLogicalId={hostId}
            xrefChoices={choices}
            onXrefReport={setReports}
            devCadIndexedFiles={viewerFiles}
          />
        </div>
      ) : null}
    </div>
  );
}
