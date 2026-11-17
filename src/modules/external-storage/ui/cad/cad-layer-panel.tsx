'use client';

import type { ArchitectureMode } from './architecture-display';
import type { LayerGroup } from './cad-layer-tools';

export type CadLayerRow = {
  index: number;
  name: string;
  visible: boolean;
  frozen: boolean;
};

export type CadLayerPanelLabels = {
  search: string;
  isolate: string;
  showAll: string;
  reset: string;
  hidePick: string;
  original: string;
  gray: string;
  mono: string;
  hidden: string;
  strength: string;
  unsupported: string;
  presets: string;
  presetOriginal: string;
  presetClean: string;
  presetElectrical: string;
  presetArchitecture: string;
  presetCustom: string;
  groups: string;
  hideGroup: string;
};

const PRESETS = ['original', 'clean', 'electrical', 'architecture', 'custom'] as const;
export type CadPreset = (typeof PRESETS)[number];

const GROUP_ORDER: LayerGroup[] = [
  'architecture',
  'electrical',
  'lighting',
  'comms',
  'dimensions',
  'text',
  'furniture',
  'axes',
];

export function CadLayerPanel({
  layers,
  labels,
  query,
  onQuery,
  onToggle,
  onIsolate,
  onShowAll,
  onReset,
  onHideGroup,
  hiddenGroups,
  isolatedIndex,
  pickToHide,
  onPickToHide,
  mode,
  strength,
  tintSupported,
  onMode,
  onStrength,
  onPreset,
  groupCounts,
  groupLabel,
  automationSupported = true,
  showModeChooser = true,
}: {
  layers: readonly CadLayerRow[];
  labels: CadLayerPanelLabels;
  query: string;
  onQuery: (value: string) => void;
  onToggle: (index: number, visible: boolean) => void;
  onIsolate: (index: number) => void;
  onShowAll: () => void;
  onReset: () => void;
  onHideGroup: (group: LayerGroup) => void;
  hiddenGroups?: ReadonlySet<LayerGroup>;
  isolatedIndex?: number | null;
  pickToHide: boolean;
  onPickToHide: (on: boolean) => void;
  mode: ArchitectureMode;
  strength: number;
  tintSupported: boolean;
  onMode: (mode: ArchitectureMode) => void;
  onStrength: (strength: number) => void;
  onPreset: (preset: CadPreset) => void;
  groupCounts: Partial<Record<LayerGroup, number>>;
  groupLabel: (group: LayerGroup) => string;
  automationSupported?: boolean;
  showModeChooser?: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const shown = needle ? layers.filter((layer) => layer.name.toLowerCase().includes(needle)) : layers;
  const presetLabel: Record<CadPreset, string> = {
    original: labels.presetOriginal,
    clean: labels.presetClean,
    electrical: labels.presetElectrical,
    architecture: labels.presetArchitecture,
    custom: labels.presetCustom,
  };
  return (
    <div className="flex flex-col gap-1 overflow-y-auto text-xs text-inherit" data-testid="cad-layer-panel">
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={labels.search}
        className="h-8 rounded border border-current/25 bg-current/10 px-2 text-inherit"
        aria-label={labels.search}
      />
      <div className="flex flex-wrap gap-1">
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" onClick={onShowAll}>{labels.showAll}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" onClick={onReset}>{labels.reset}</button>
        <button type="button" className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={pickToHide} onClick={() => onPickToHide(!pickToHide)}>
          {labels.hidePick}
        </button>
      </div>
      {automationSupported ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label={labels.presets}>
          {PRESETS.map((preset) => (
            <button key={preset} type="button" className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" onClick={() => onPreset(preset)}>
              {presetLabel[preset]}
            </button>
          ))}
        </div>
      ) : null}
      {showModeChooser ? (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label={labels.original}>
            {(['original', 'gray', 'mono', 'hidden'] as const).map((item) => {
              const disabled = item !== 'original' && item !== 'hidden' && !tintSupported;
              const text = item === 'original' ? labels.original : item === 'gray' ? labels.gray : item === 'mono' ? labels.mono : labels.hidden;
              return (
                <button
                  key={item}
                  type="button"
                  className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white disabled:opacity-50"
                  aria-pressed={mode === item}
                  disabled={disabled}
                  title={disabled ? labels.unsupported : text}
                  onClick={() => onMode(item)}
                >
                  {text}
                </button>
              );
            })}
          </div>
          {mode === 'gray' && tintSupported ? (
            <label className="flex items-center gap-2">
              <span>{labels.strength}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(strength * 100)}
                aria-label={labels.strength}
                onChange={(event) => onStrength(Number(event.target.value) / 100)}
              />
            </label>
          ) : null}
          {!tintSupported ? <p className="text-[var(--pf-text-secondary)]">{labels.unsupported}</p> : null}
        </>
      ) : null}
      {automationSupported ? (
        <div className="flex flex-wrap gap-1" aria-label={labels.groups}>
          {GROUP_ORDER.map((group) => {
            const count = groupCounts[group] ?? 0;
            if (count === 0) return null;
            return (
              <button key={group} type="button" className="h-8 rounded border border-current/25 px-2 text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={hiddenGroups?.has(group) ?? false} onClick={() => onHideGroup(group)}>
                {labels.hideGroup} {groupLabel(group)} ({count})
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
        {shown.map((layer) => (
          <li key={layer.index} className={`flex min-w-0 items-center gap-1 rounded border px-1 py-0.5 ${layer.visible ? 'border-current/15' : 'border-rose-600 bg-rose-600/20'}`}>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-sky-600"
              checked={layer.visible}
              disabled={layer.frozen}
              aria-label={layer.name}
              onChange={(event) => onToggle(layer.index, event.target.checked)}
            />
            <span className={`min-w-0 flex-1 truncate ${layer.visible ? 'text-inherit' : 'line-through opacity-70'}`}>{layer.name}</span>
            <button type="button" className="h-6 shrink-0 rounded border border-current/25 px-1 text-[10px] text-inherit aria-pressed:border-sky-800 aria-pressed:bg-sky-600 aria-pressed:text-white" aria-pressed={isolatedIndex === layer.index} onClick={() => onIsolate(layer.index)}>
              {labels.isolate}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
