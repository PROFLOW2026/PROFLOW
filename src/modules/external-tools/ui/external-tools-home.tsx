'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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
  const [reports, setReports] = useState<readonly { blockName: string; savedPath: string }[]>([]);
  const [choices, setChoices] = useState<
    readonly { parentLogicalId: string; blockName: string; savedPath: string; logicalId: string }[]
  >([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const indexed = useMemo(() => indexLocalFiles(rows), [rows]);
  const collisions = indexed.some((row) => row.ambiguous);

  async function takeFiles(list: FileList | File[]) {
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
    setRows(next);
    setHostId(null);
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function openHost(logicalId: string) {
    const row = rows.find((item) => item.logicalId === logicalId);
    if (!row) return;
    const copy = row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([copy]));
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setHostId(logicalId);
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

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden" dir="rtl">
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-base font-semibold">פתיחת תוכנית</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">הקובץ נשאר במכשיר. אין העלאה ואין פרויקט.</p>
        </section>
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-base font-semibold">כתב כמויות</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">ניתוח זמני לשש שעות, בלי שורה בפרויקט.</p>
        </section>
      </div>
      <div
        className="flex min-w-0 flex-col gap-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length > 0) void takeFiles(event.dataTransfer.files);
        }}
      >
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          בחירת קבצים
          <input
            className="min-w-0 max-w-full"
            type="file"
            multiple
            accept=".dwg,.dxf,.pdf,.ctb,.zip"
            onChange={(event) => {
              if (event.target.files) void takeFiles(event.target.files);
            }}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          בחירת תיקייה
          <input
            className="min-w-0 max-w-full"
            type="file"
            multiple
            // The folder picker is a browser attribute, not a React prop.
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(event) => {
              if (event.target.files) void takeFiles(event.target.files);
            }}
          />
        </label>
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
      <ul className="flex min-w-0 flex-col gap-2">
        {indexed.map((row) => (
          <li key={row.logicalId} className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
            <p className="break-words text-sm">{row.relativePath}</p>
            {canView ? (
              <button type="button" className="mt-2 min-h-11 text-sm" onClick={() => openHost(row.logicalId)}>
                פתיחה
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {notice ? <p className="text-sm">{notice}</p> : null}
      {canTakeoff ? (
        <button
          type="button"
          className="min-h-11 self-start rounded-md bg-[var(--pf-action-primary)] px-4 text-sm text-[var(--pf-action-primary-fg)]"
          onClick={() => {
            void (async () => {
              setNotice('פותחים סשן זמני...');
              const response = await fetch('/api/tools/external/sessions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ choices }),
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
              for (const row of rows) {
                const fileResponse = await fetch(`/api/tools/external/sessions/${sessionId}/files`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    logicalId: row.logicalId,
                    relativePath: row.relativePath,
                    role: row.logicalId === hostId ? 'host' : 'xref',
                    size: row.bytes.byteLength,
                  }),
                });
                if (!fileResponse.ok) {
                  setNotice('רישום הקבצים נכשל. לא הופעל ניתוח.');
                  return;
                }
              }
              for (const choice of choices) {
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
              for (const row of rows) {
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
            })();
          }}
        >
          כתב כמויות מהקבצים שנבחרו
        </button>
      ) : null}
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
