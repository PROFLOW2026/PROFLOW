'use client';

import { useMemo, useState } from 'react';
import type { CadIndexedFile } from './xref-resolver';
import { CadAlternateFontsButton } from '../cad-alternate-fonts-button';
import { PfDwgVersionedViewer } from '../pf-dwg-versioned-viewer';

const SAMPLES = [
  { id: '3031-SW', fileName: '3031-SW.dwg', xrefBundle: null as string | null },
  { id: '3096-EL', fileName: '3096-EL.dwg', xrefBundle: '3096-EL' },
] as const;

async function fetchLocalDwg(name: string): Promise<Uint8Array> {
  const res = await fetch(
    `/api/dev/pf-cad-local-dwg?name=${encodeURIComponent(name)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`local dwg ${name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchFixtureDwg(bundle: string, name: string): Promise<Uint8Array> {
  const res = await fetch(
    `/api/dev/pf-cad-fixture?bundle=${encodeURIComponent(bundle)}&name=${encodeURIComponent(name)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`fixture ${bundle}/${name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchDevFont(name: string): Promise<Uint8Array> {
  const res = await fetch(
    `/api/dev/pf-cad-fixture?source=font&name=${encodeURIComponent(name)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`dev font ${name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const DEV_SYNTHETIC_FONTS = [
  'MIRYL.SHX',
  'MIRYLB.SHX',
  'HEBTXT.SHX',
  'miryl.shx',
  'mirylb.shx',
  'hebtxt.shx',
] as const;

function devIndexedFiles(
  hostName: string,
  siblingNames: readonly string[],
  xrefBundle: string | null,
): CadIndexedFile[] {
  const all = new Set<string>([hostName, ...siblingNames, ...DEV_SYNTHETIC_FONTS]);
  return [...all].map((name) => ({
    name,
    getBytes: () => {
      if (/\.(shx|ttf|otf)$/i.test(name)) {
        return fetchDevFont(name);
      }
      return name === hostName || !xrefBundle
        ? fetchLocalDwg(name).catch(() => fetchFixtureDwg(xrefBundle ?? '3096-EL', name))
        : fetchFixtureDwg(xrefBundle, name);
    },
  }));
}

export function PfCadLocalDevPage({ locale }: { locale: string }) {
  const [sampleId, setSampleId] = useState<(typeof SAMPLES)[number]['id']>('3031-SW');
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0]!;

  const devIndexed = useMemo(() => {
    const siblingNames =
      sample.xrefBundle != null
        ? [
            '2205 - Petah Tikva_Hepez-Haim-Trafo 1-100.dwg',
            '2205 - Petah Tikva_Hepez-Haim-Trafo 1-50.dwg',
            '6396-230+285.dwg',
          ]
        : [];
    return devIndexedFiles(sample.fileName, siblingNames, sample.xrefBundle);
  }, [sample.fileName, sample.xrefBundle]);

  const url = `/api/dev/pf-cad-local-dwg?name=${encodeURIComponent(sample.fileName)}`;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">PF CAD local viewer ({locale})</span>
        <CadAlternateFontsButton />
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rounded border px-2 py-0.5 ${s.id === sampleId ? 'bg-muted font-semibold' : ''}`}
            onClick={() => setSampleId(s.id)}
          >
            {s.id}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <PfDwgVersionedViewer
          url={url}
          fileName={sample.fileName}
          reloadKey={sampleId === '3031-SW' ? 1 : 2}
          onRetry={() => {}}
          scope="org"
          devCadIndexedFiles={devIndexed}
        />
      </div>
    </div>
  );
}
