'use client';

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
}): { panel: ReactNode; overlay: ReactNode } {
  const toolsRef = useRef<CadToolsHandle>(null);
  const [capture, setCapture] = useState<Capture>(null);
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
      onLayers={input.onLayers}
      onArchitecture={input.onArchitecture}
      onFocusWorld={input.onFocusWorld}
      onSelectSheet={input.onSelectSheet}
      onCapture={setCapture}
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
  return { panel, overlay };
}
