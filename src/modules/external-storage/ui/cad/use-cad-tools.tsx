'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
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
import type { ArchitectureMode } from './architecture-display';

type Capture = 'measure' | 'inspect' | 'hide' | null;

export function CadArchitectureModeSelect({
  mode,
  onChange,
}: {
  mode: ArchitectureMode;
  onChange: (mode: ArchitectureMode) => void;
}) {
  const t = useTranslations('externalStorage.preview');
  return (
    <label className="flex items-center gap-1 text-xs text-[var(--pf-text-primary)]">
      <span className="hidden sm:inline">{t('cadArchBackground')}</span>
      <select
        className="h-8 max-w-full rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2"
        aria-label={t('cadArchBackground')}
        data-testid="cad-architecture-mode"
        value={mode}
        onChange={(event) => onChange(event.target.value as ArchitectureMode)}
      >
        <option value="original">{t('cadArchOriginal')}</option>
        <option value="gray">{t('cadArchGray')}</option>
        <option value="mono">{t('cadArchMono')}</option>
        <option value="hidden">{t('cadArchHidden')}</option>
      </select>
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
  const [capture, setCapture] = useState<Capture>(null);
  const [shownMode, setShownMode] = useState<ArchitectureMode>(input.architectureMode ?? 'original');
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
      onChange={(mode) => toolsRef.current?.setArchitecture(mode)}
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
