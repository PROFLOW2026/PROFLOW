'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attachCadViewportInteraction } from './cad-viewport-interaction';
import { CadEngineClient, type CadLoadTimings } from './cad-engine-client';
import { createCadRenderer, type CadRendererHandle } from './pf-renderer-bridge';
import { buildFileIndex, type CadIndexedFile } from './xref-resolver';

const BUNDLES = [
  { id: '3096-EL', host: '3096-EL.dwg', label: '3096-EL + 4 XREF' },
  { id: '3621-EL', host: '3621-EL.dwg', label: '3621-EL + G1/G2' },
] as const;

const fixtureCache = new Map<string, Promise<Uint8Array>>();

async function fetchFixture(bundle: string, name: string): Promise<Uint8Array> {
  const key = `${bundle}/${name}`;
  let pending = fixtureCache.get(key);
  if (!pending) {
    pending = fetch(
      `/api/dev/pf-cad-fixture?bundle=${encodeURIComponent(bundle)}&name=${encodeURIComponent(name)}`,
    ).then(async (res) => {
      if (!res.ok) throw new Error(`fixture ${name}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
    fixtureCache.set(key, pending);
  }
  return pending;
}

async function listFixtureDwgs(bundle: string): Promise<string[]> {
  const res = await fetch(
    `/api/dev/pf-cad-fixture?bundle=${encodeURIComponent(bundle)}&list=1`,
  );
  if (!res.ok) throw new Error(`list ${bundle}: HTTP ${res.status}`);
  const json = (await res.json()) as { files: string[] };
  return json.files;
}

function formatTimings(t: CadLoadTimings & { downloadHostMs?: number; timeToFirstFrameMs?: number }) {
  return [
    `hostDl=${Math.round(t.downloadHostMs ?? 0)}ms`,
    `xrefDl=${Math.round(t.downloadXrefMs)}ms`,
    `wasm=${Math.round(t.wasmInitMs)}ms`,
    `probes=${t.xrefProbeCount}@${Math.round(t.xrefProbeMs)}ms`,
    `parse=${Math.round(t.finalParseMs)}ms`,
    `ttff=${Math.round(t.timeToFirstFrameMs ?? 0)}ms`,
  ].join(' ');
}

export function PfCadDevHarness() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRendererHandle | null>(null);
  const [status, setStatus] = useState('idle');
  const [segments, setSegments] = useState(0);
  const [resolvedXrefs, setResolvedXrefs] = useState(0);
  const [unresolvedXrefs, setUnresolvedXrefs] = useState(0);
  const [timingsLine, setTimingsLine] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rendererRef.current = createCadRenderer({ canvas });
    const detachNav = attachCadViewportInteraction(canvas, {
      panBy: (dx, dy) => rendererRef.current?.panBy(dx, dy),
      zoomAt: (sx, sy, factor) => rendererRef.current?.zoomAt(sx, sy, factor),
    });
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 800, height: 600 };
      rendererRef.current?.resize(width, height, window.devicePixelRatio || 1);
    });
    ro.observe(canvas.parentElement ?? canvas);
    return () => {
      detachNav();
      ro.disconnect();
      rendererRef.current?.dispose();
    };
  }, []);

  const runBundle = useCallback(async (bundleId: string, host: string) => {
    setStatus('loading');
    setTimingsLine('');
    try {
      const loadStarted = performance.now();
      const names = await listFixtureDwgs(bundleId);
      const indexed: CadIndexedFile[] = names.map((name) => ({
        name,
        getBytes: () => fetchFixture(bundleId, name),
      }));
      const fileIndex = buildFileIndex(indexed);
      const tHost0 = performance.now();
      const hostBytes = await fetchFixture(bundleId, host);
      const downloadHostMs = performance.now() - tHost0;
      let captured: CadLoadTimings | null = null;
      const client = new CadEngineClient({
        onTimings: (t) => {
          captured = t;
        },
      });
      const res = await client.parseDwgFromStorage({
        fileName: host,
        hostBytes,
        fileIndex,
      });
      client.dispose();
      rendererRef.current?.setDrawing(res.segments, res.scene.robustExtent);
      rendererRef.current?.fit();
      const timeToFirstFrameMs = performance.now() - loadStarted;
      const report = res.scene.report;
      const xrefTotal = Object.keys(report.xrefs ?? {}).length;
      const resolved = report.resolvedXrefs ?? 0;
      setSegments(res.scene.segmentCount);
      setResolvedXrefs(resolved);
      setUnresolvedXrefs(Math.max(0, xrefTotal - resolved));
      const line = formatTimings({
        ...(captured ?? {
          downloadXrefMs: 0,
          xrefProbeMs: 0,
          xrefProbeCount: 0,
          wasmInitMs: 0,
          finalParseMs: 0,
          totalParseMs: 0,
        }),
        downloadHostMs,
        timeToFirstFrameMs,
      });
      setTimingsLine(line);
      setStatus(
        `ok seg=${res.scene.segmentCount} resolvedXrefs=${resolved} unresolved=${Math.max(0, xrefTotal - resolved)}`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const buttons = useMemo(() => BUNDLES, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <p className="text-sm font-medium">PF CAD dev harness (local fixtures)</p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.id}
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={() => void runBundle(b.id, b.host)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="pf-cad-dev-status">
        {status} | segments={segments} resolvedXrefs={resolvedXrefs} unresolved={unresolvedXrefs}
      </p>
      {timingsLine ? (
        <p className="text-xs font-mono text-muted-foreground" data-testid="pf-cad-dev-timings">
          {timingsLine}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1 rounded border bg-[#0a0e14]">
        <canvas ref={canvasRef} className="size-full touch-none" />
      </div>
    </div>
  );
}
