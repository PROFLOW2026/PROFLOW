'use client';

import { useTranslations } from 'next-intl';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { displayArchitecturalLayerIndexes } from '@/modules/electrical-takeoff/domain/architectural-background';
import type { ArchitectureMode } from './architecture-display';
import { CadLayerPanel, type CadLayerRow, type CadPreset } from './cad-layer-panel';
import {
  cumulativeDistance,
  drawingArea,
  drawingDistance,
  layersForGroup,
  suggestLayerGroup,
  type LayerGroup,
} from './cad-layer-tools';
import { readCadViewPreference, writeCadViewPreference } from './cad-view-prefs';

export type CadHit = {
  x: number;
  y: number;
  layerName: string | null;
  text: string | null;
  sheet: string;
  markId: string | null;
};

export type CadToolsHandle = {
  clickWorld: (hit: CadHit) => void;
  setArchitecture: (mode: ArchitectureMode) => void;
};

export type CadTextHit = { text: string; x: number; y: number; layer: number };
export type CadSheetHit = { id: string; label: string };

type Capture = 'measure' | 'inspect' | 'hide' | null;
type MeasureKind = 'distance' | 'chain' | 'area';

function replaceVisibility(layers: readonly CadLayerRow[], indexes: ReadonlySet<number>, visible: boolean): CadLayerRow[] {
  return layers.map((layer) => (indexes.has(layer.index) ? { ...layer, visible: layer.frozen ? layer.visible : visible } : layer));
}

export const CadViewerSidePanel = forwardRef<CadToolsHandle, {
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
  onCapture: (capture: Capture) => void;
  onDisplayedMode?: (mode: ArchitectureMode) => void;
  showModeChooser?: boolean;
  architectureMode?: ArchitectureMode;
  architectureStrength?: number;
}>(function CadViewerSidePanel({
  layers,
  xrefNames,
  texts,
  sheets,
  blocks,
  activeSheet,
  tintSupported,
  automationSupported,
  documentId,
  onLayers,
  onArchitecture,
  onFocusWorld,
  onSelectSheet,
  onCapture,
  onDisplayedMode,
  showModeChooser = true,
  architectureMode,
  architectureStrength,
}, ref) {
  const t = useTranslations('externalStorage.preview');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ArchitectureMode>('original');
  const [strength, setStrength] = useState(0.7);
  const [pickToHide, setPickToHide] = useState(false);
  const [measureOn, setMeasureOn] = useState(false);
  const [inspectOn, setInspectOn] = useState(false);
  const [measureKind, setMeasureKind] = useState<MeasureKind>('distance');
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [inspect, setInspect] = useState<CadHit | null>(null);
  const [isolatedIndex, setIsolatedIndex] = useState<number | null>(null);
  const isolateSnapshot = useRef<CadLayerRow[] | null>(null);
  const initialRef = useRef<CadLayerRow[]>([]);
  const appliedRef = useRef(false);

  const architectural = useMemo(
    () => new Set(displayArchitecturalLayerIndexes(layers, xrefNames)),
    [layers, xrefNames],
  );

  useEffect(() => {
    if (initialRef.current.length === 0 && layers.length > 0) initialRef.current = layers.map((layer) => ({ ...layer }));
  }, [layers]);

  const publishMode = useCallback((nextMode: ArchitectureMode, nextStrength: number) => {
    setMode(nextMode);
    setStrength(nextStrength);
    onDisplayedMode?.(nextMode);
    const indexes = [...architectural];
    onArchitecture(nextMode, nextStrength, indexes);
    if (!tintSupported && (nextMode === 'hidden' || nextMode === 'original')) {
      const base = initialRef.current.length > 0 ? initialRef.current : layers;
      onLayers(nextMode === 'hidden'
        ? replaceVisibility(layers, architectural, false)
        : layers.map((layer) => {
          const saved = base.find((row) => row.index === layer.index);
          return architectural.has(layer.index) && saved ? { ...layer, visible: saved.visible } : layer;
        }));
    }
  }, [architectural, layers, onArchitecture, onDisplayedMode, onLayers, tintSupported]);

  useEffect(() => {
    if (appliedRef.current || layers.length === 0 || !documentId || typeof localStorage === 'undefined') return;
    appliedRef.current = true;
    const saved = readCadViewPreference(localStorage, documentId);
    if (!saved) return;
    if (showModeChooser && saved.architectureMode) publishMode(saved.architectureMode, saved.grayStrength ?? strength);
    if (saved.hiddenLayers && saved.hiddenLayers.length > 0) {
      const hidden = new Set(saved.hiddenLayers);
      onLayers(layers.map((layer) => (hidden.has(layer.index) ? { ...layer, visible: false } : layer)));
    }
    if (saved.sheetId) onSelectSheet(saved.sheetId);
    // The saved view is applied once, when the first layer list arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, documentId]);

  useEffect(() => {
    if (!documentId || typeof localStorage === 'undefined' || !appliedRef.current) return;
    writeCadViewPreference(localStorage, documentId, {
      sheetId: activeSheet,
      architectureMode: architectureMode ?? mode,
      grayStrength: architectureStrength ?? strength,
      hiddenLayers: layers.filter((layer) => !layer.visible).map((layer) => layer.index),
      preset: mode,
    });
  }, [activeSheet, architectureMode, architectureStrength, documentId, layers, mode, strength]);

  useImperativeHandle(ref, () => ({
    setArchitecture: (next: ArchitectureMode) => publishMode(next, architectureStrength ?? strength),
    clickWorld: (hit) => {
      if (pickToHide && hit.layerName) {
        onLayers(layers.map((layer) => (
          layer.name === hit.layerName && !layer.frozen ? { ...layer, visible: !layer.visible } : layer
        )));
        return;
      }
      if (measureOn) {
        setPoints((current) => {
          const next = [...current, { x: hit.x, y: hit.y }];
          return measureKind === 'distance' ? next.slice(-2) : next;
        });
        return;
      }
      if (inspectOn) setInspect(hit);
    },
  }), [architectureStrength, inspectOn, layers, measureKind, measureOn, onLayers, pickToHide, publishMode, strength]);

  const setCapture = (next: Capture) => {
    setPickToHide(next === 'hide');
    setMeasureOn(next === 'measure');
    setInspectOn(next === 'inspect');
    onCapture(next);
  };

  const chooseMeasure = (kind: MeasureKind) => {
    if (measureOn && measureKind === kind) {
      setCapture(null);
      return;
    }
    setMeasureKind(kind);
    setCapture('measure');
  };

  const toggleIsolate = (index: number) => {
    if (isolatedIndex === index && isolateSnapshot.current) {
      onLayers(isolateSnapshot.current.map((layer) => ({ ...layer })));
      isolateSnapshot.current = null;
      setIsolatedIndex(null);
      return;
    }
    if (!isolateSnapshot.current) isolateSnapshot.current = layers.map((layer) => ({ ...layer }));
    setIsolatedIndex(index);
    onLayers(layers.map((layer) => ({ ...layer, visible: layer.index === index && !layer.frozen })));
  };

  const groupCounts = useMemo(() => {
    const counts: Partial<Record<LayerGroup, number>> = {};
    for (const layer of layers) {
      const group = suggestLayerGroup(layer.name, architectural.has(layer.index));
      if (group === 'unknown') continue;
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return counts;
  }, [architectural, layers]);

  const hiddenGroups = useMemo(() => {
    const shown = new Map<LayerGroup, boolean>();
    for (const layer of layers) {
      const group = suggestLayerGroup(layer.name, architectural.has(layer.index));
      if (group === 'unknown') continue;
      shown.set(group, (shown.get(group) ?? false) || (!layer.frozen && layer.visible));
    }
    const hidden = new Set<LayerGroup>();
    for (const [group, anyVisible] of shown) {
      if (!anyVisible) hidden.add(group);
    }
    return hidden;
  }, [architectural, layers]);

  const needle = query.trim().toLowerCase();
  const textHits = needle ? texts.filter((row) => row.text.toLowerCase().includes(needle)).slice(0, 20) : [];
  const sheetHits = needle ? sheets.filter((row) => row.label.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)).slice(0, 12) : [];
  const blockHits = needle ? blocks.filter((name) => name.toLowerCase().includes(needle)).slice(0, 12) : [];
  const distance = points.length >= 2 ? drawingDistance(points[0]!.x, points[0]!.y, points[1]!.x, points[1]!.y) : 0;
  const chain = cumulativeDistance(points);
  const area = drawingArea(points);
  const groupNames: Record<LayerGroup, string> = {
    architecture: t('cadGroupArchitecture'),
    electrical: t('cadGroupElectrical'),
    lighting: t('cadGroupLighting'),
    comms: t('cadGroupComms'),
    dimensions: t('cadGroupDimensions'),
    text: t('cadGroupText'),
    furniture: t('cadGroupFurniture'),
    axes: t('cadGroupAxes'),
    unknown: '',
  };

  return (
    <div className="flex flex-col gap-1" data-testid="cad-viewer-tools">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('cadSearch')}
        aria-label={t('cadSearch')}
        className="h-8 rounded border border-current/25 bg-current/10 px-2 text-xs text-inherit"
      />
      {needle ? (
        <ul className="max-h-32 space-y-1 overflow-auto text-xs">
          {textHits.map((row, index) => (
            <li key={`text-${index}`}>
              <button type="button" className="h-8 w-full truncate rounded border border-current/25 px-2 text-start text-inherit" onClick={() => onFocusWorld(row.x, row.y)}>
                {row.text}
              </button>
            </li>
          ))}
          {sheetHits.map((row) => (
            <li key={row.id}>
              <button type="button" className="h-8 w-full truncate rounded border border-current/25 px-2 text-start text-inherit" onClick={() => onSelectSheet(row.id)}>
                {row.label}
              </button>
            </li>
          ))}
          {blockHits.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="h-8 w-full truncate rounded border border-current/25 px-2 text-start text-inherit"
                onClick={() => {
                  const layer = layers.find((row) => row.name.toLowerCase().includes(name.toLowerCase()));
                  if (!layer) return;
                  toggleIsolate(layer.index);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={measureOn} onClick={() => setCapture(measureOn ? null : 'measure')}>
          {t('cadMeasure')}
        </button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={measureOn && measureKind === 'distance'} onClick={() => chooseMeasure('distance')}>{t('cadMeasureDistance')}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={measureOn && measureKind === 'chain'} onClick={() => chooseMeasure('chain')}>{t('cadMeasureChain')}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={measureOn && measureKind === 'area'} onClick={() => chooseMeasure('area')}>{t('cadMeasureArea')}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" onClick={() => setPoints([])}>{t('cadClear')}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-xs text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={inspectOn} onClick={() => setCapture(inspectOn ? null : 'inspect')}>
          {t('cadInspect')}
        </button>
      </div>
      {points.length >= 2 ? (
        <p className="text-xs" data-testid="cad-measure-readout">
          {measureKind === 'area' ? area.toFixed(2) : measureKind === 'chain' ? chain.toFixed(2) : distance.toFixed(2)} {t('cadUnits')}
        </p>
      ) : null}
      {inspect ? (
        <div className="space-y-1 text-xs" data-testid="cad-inspect">
          <p>{inspect.text ?? t('cadNoHit')}</p>
          <p>{inspect.layerName ?? ''}</p>
          <p>{inspect.x.toFixed(2)}, {inspect.y.toFixed(2)}</p>
          <p>{inspect.sheet}</p>
          {inspect.markId ? <p>{inspect.markId}</p> : null}
          <button
            type="button"
            className="min-h-11 rounded border px-2"
            onClick={() => {
              const summary = [inspect.text, inspect.layerName, `${inspect.x}, ${inspect.y}`, inspect.sheet, inspect.markId].filter(Boolean).join('\n');
              void navigator.clipboard?.writeText(summary);
            }}
          >
            {t('cadCopy')}
          </button>
        </div>
      ) : null}
      <CadLayerPanel
        layers={layers}
        labels={{
          search: t('cadLayerSearch'),
          isolate: t('cadLayerIsolate'),
          showAll: t('cadLayerShowAll'),
          reset: t('cadLayerReset'),
          hidePick: t('cadLayerHidePick'),
          original: t('cadArchOriginal'),
          gray: t('cadArchGray'),
          mono: t('cadArchMono'),
          hidden: t('cadArchHidden'),
          strength: t('cadArchStrength'),
          unsupported: t('cadArchUnsupported'),
          presets: t('cadPresets'),
          presetOriginal: t('cadPresetOriginal'),
          presetClean: t('cadPresetClean'),
          presetElectrical: t('cadPresetElectrical'),
          presetArchitecture: t('cadPresetArchitecture'),
          presetCustom: t('cadPresetCustom'),
          groups: t('cadHideGroup'),
          hideGroup: t('cadHideGroup'),
        }}
        query={query}
        onQuery={setQuery}
        onToggle={(index, visible) => onLayers(layers.map((layer) => (layer.index === index ? { ...layer, visible } : layer)))}
        onIsolate={toggleIsolate}
        isolatedIndex={isolatedIndex}
        onShowAll={() => {
          isolateSnapshot.current = null;
          setIsolatedIndex(null);
          onLayers(layers.map((layer) => ({ ...layer, visible: layer.frozen ? layer.visible : true })));
        }}
        onReset={() => {
          isolateSnapshot.current = null;
          setIsolatedIndex(null);
          const base = initialRef.current.length > 0 ? initialRef.current : layers;
          onLayers(base.map((layer) => ({ ...layer })));
          publishMode('original', 0.7);
        }}
        onHideGroup={(group) => {
          const members = layersForGroup(layers, architectural, group);
          const indexes = new Set(members);
          if (indexes.size === 0) return;
          const hiding = layers.some((layer) => indexes.has(layer.index) && !layer.frozen && layer.visible);
          onLayers(replaceVisibility(layers, indexes, !hiding));
        }}
        hiddenGroups={hiddenGroups}
        pickToHide={pickToHide}
        onPickToHide={(on) => setCapture(on ? 'hide' : null)}
        mode={architectureMode ?? mode}
        strength={architectureStrength ?? strength}
        tintSupported={tintSupported}
        automationSupported={automationSupported}
        showModeChooser={showModeChooser}
        onMode={(next) => publishMode(next, architectureStrength ?? strength)}
        onStrength={(next) => publishMode(architectureMode ?? mode, next)}
        onPreset={(preset: CadPreset) => {
          if (preset === 'custom') return;
          if (preset === 'original') {
            const base = initialRef.current.length > 0 ? initialRef.current : layers;
            onLayers(base.map((layer) => ({ ...layer })));
            publishMode('original', strength);
            return;
          }
          if (preset === 'clean') publishMode('gray', 0.7);
          if (preset === 'electrical') publishMode('gray', 0.25);
          if (preset === 'architecture') publishMode('original', strength);
        }}
        groupCounts={groupCounts}
        groupLabel={(group) => groupNames[group]}
      />
    </div>
  );
});
