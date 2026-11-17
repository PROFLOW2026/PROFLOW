'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { architecturalLayerIndexes } from '@/modules/electrical-takeoff/domain/architectural-background';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';
import { worldFromClientPoint } from './cad-pointer-math';
import { layerIndexNear, snapToEndpoint } from './cad-layer-tools';
import {
  CadViewerSidePanel,
  type CadHit,
  type CadSheetHit,
  type CadTextHit,
  type CadToolsHandle,
} from './cad-viewer-side-panel';
import type { CadLayerRow } from './cad-layer-panel';
import { resolveArchitectureApply, type ArchitectureMode } from './architecture-display';

type Capture = 'measure' | 'inspect' | 'hide' | null;

export function CadArchitectureModeSelect({
  mode,
  onChange,
  tintSupported,
  note,
}: {
  mode: ArchitectureMode;
  onChange: (mode: ArchitectureMode) => void;
  tintSupported: boolean;
  note: 'missing' | 'unsupported' | null;
}) {
  const t = useTranslations('externalStorage.preview');
  const options = (tintSupported ? ['original', 'gray', 'mono', 'hidden'] : ['original', 'hidden']) as readonly ArchitectureMode[];
  const label = (item: ArchitectureMode) => (
    item === 'original' ? t('cadArchOriginal') : item === 'gray' ? t('cadArchGray') : item === 'mono' ? t('cadArchMono') : t('cadArchHidden')
  );
  return (
    <label className="flex max-w-full min-w-0 flex-wrap items-center gap-1 text-xs text-[var(--pf-text-primary)]">
      <span className="hidden shrink-0 sm:inline">{t('cadArchBackground')}</span>
      <select
        className={cn(
          buttonVariants({ variant: 'secondary', size: 'sm' }),
          'w-auto max-w-[9.5rem] cursor-pointer truncate py-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        )}
        aria-label={t('cadArchBackground')}
        data-testid="cad-architecture-mode"
        value={options.includes(mode) ? mode : 'original'}
        onChange={(event) => onChange(event.target.value as ArchitectureMode)}
      >
        {options.map((item) => (
          <option key={item} value={item}>{label(item)}</option>
        ))}
      </select>
      {note ? (
        <span className="basis-full text-[var(--pf-text-secondary)]" data-testid="cad-architecture-note">
          {note === 'missing' ? t('cadArchMissing') : t('cadArchUnsupported')}
        </span>
      ) : null}
    </label>
  );
}

export function useCadTools(input: {
  layers: readonly CadLayerRow[];
  xrefNames: readonly string[];
  texts: readonly CadTextHit[];
  sheets: readonly CadSheetHit[];
  blocks: readonly string[];
  activeSheet: string;
  tintSupported: boolean;
  automationSupported: boolean;
  documentId: string;
  showModeChooser?: boolean;
  architectureMode?: ArchitectureMode;
  architectureStrength?: number;
  onLayers: (layers: CadLayerRow[]) => void;
  onArchitecture: (mode: ArchitectureMode, strength: number, indexes: number[]) => void;
  onFocusWorld: (x: number, y: number) => void;
  onSelectSheet: (id: string) => void;
  readScene: () => {
    canvas: HTMLCanvasElement;
    view: { panX: number; panY: number; zoom: number };
    segments: Float32Array;
    stride: number;
    marks?: readonly { id: string; x: number; y: number }[];
  } | null;
}): { panel: ReactNode; overlay: ReactNode; modeSelect: ReactNode } {
  const toolsRef = useRef<CadToolsHandle>(null);
  const baselineRef = useRef<CadLayerRow[] | null>(null);
  const [capture, setCapture] = useState<Capture>(null);
  const [shownMode, setShownMode] = useState<ArchitectureMode>(input.architectureMode ?? 'original');
  const [note, setNote] = useState<'missing' | 'unsupported' | null>(null);
  const applyMode = (mode: ArchitectureMode) => {
    if (!baselineRef.current && input.layers.length > 0) {
      baselineRef.current = input.layers.map((layer) => ({ ...layer }));
    }
    const decision = resolveArchitectureApply(
      mode,
      input.tintSupported,
      architecturalLayerIndexes(input.layers, input.xrefNames),
    );
    if (!decision.ok) {
      setNote(decision.reason);
      if (decision.reason === 'missing') setShownMode('original');
      return;
    }
    setNote(null);
    setShownMode(decision.mode);
    if (toolsRef.current) {
      toolsRef.current.setArchitecture(decision.mode);
      return;
    }
    const strength = input.architectureStrength ?? 0.7;
    input.onArchitecture(decision.mode, strength, decision.indexes);
    if (!input.tintSupported) {
      const architectural = new Set(decision.indexes);
      const base = baselineRef.current ?? input.layers;
      input.onLayers(decision.mode === 'hidden'
        ? input.layers.map((layer) => (architectural.has(layer.index) && !layer.frozen ? { ...layer, visible: false } : layer))
        : input.layers.map((layer) => {
          const saved = base.find((row) => row.index === layer.index);
          return architectural.has(layer.index) && saved ? { ...layer, visible: saved.visible } : layer;
        }));
    }
  };
  const panel = (
    <CadViewerSidePanel
      ref={toolsRef}
      layers={input.layers}
      xrefNames={input.xrefNames}
      texts={input.texts}
      sheets={input.sheets}
      blocks={input.blocks}
      activeSheet={input.activeSheet}
      tintSupported={input.tintSupported}
      automationSupported={input.automationSupported}
      documentId={input.documentId}
      showModeChooser={input.showModeChooser}
      architectureMode={input.architectureMode}
      architectureStrength={input.architectureStrength}
      onLayers={input.onLayers}
      onArchitecture={input.onArchitecture}
      onFocusWorld={input.onFocusWorld}
      onSelectSheet={input.onSelectSheet}
      onCapture={setCapture}
      onDisplayedMode={setShownMode}
    />
  );
  const modeSelect = (
    <CadArchitectureModeSelect
      mode={input.architectureMode ?? shownMode}
      tintSupported={input.tintSupported}
      note={note}
      onChange={applyMode}
    />
  );
  const overlay = capture ? (
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      data-testid="cad-tool-capture"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const scene = input.readScene();
        if (!scene) return;
        const raw = worldFromClientPoint(scene.canvas, event.clientX, event.clientY, scene.view);
        const radius = 12 / (scene.view.zoom > 1e-9 ? scene.view.zoom : 1);
        const point = snapToEndpoint(scene.segments, scene.stride, raw.x, raw.y, radius);
        const layerIndex = layerIndexNear(scene.segments, scene.stride, point.x, point.y, radius);
        const layerName = input.layers.find((layer) => layer.index === layerIndex)?.name ?? null;
        let text: string | null = null;
        let best = radius * radius;
        for (const row of input.texts) {
          const distance = (row.x - point.x) ** 2 + (row.y - point.y) ** 2;
          if (distance <= best) {
            best = distance;
            text = row.text;
          }
        }
        let markId: string | null = null;
        for (const mark of scene.marks ?? []) {
          const distance = (mark.x - point.x) ** 2 + (mark.y - point.y) ** 2;
          if (distance <= best) {
            best = distance;
            markId = mark.id;
          }
        }
        const hit: CadHit = {
          x: point.x,
          y: point.y,
          layerName,
          text,
          sheet: input.activeSheet,
          markId,
        };
        toolsRef.current?.clickWorld(hit);
      }}
    />
  ) : null;
  return { panel, overlay, modeSelect };
}
