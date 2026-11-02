'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, inputClassName } from '@/components/ui/input';
import { buildLocationIndex, locationPath, type LocationNode, type LocationType } from '@/modules/project-profile/domain/locations';
import {
  UNIT_KINDS,
  UNIT_KIND_LABELS,
  WIZARD_LIMITS,
  unitName,
  type UnitKind,
} from '@/modules/project-profile/domain/structure-wizard';
import { isLevelType, isUnitType, suggestUnitNumber, unitLevels } from '@/modules/project-profile/domain/unit-levels';
import type { StructureActionResult } from '@/modules/project-profile/ui/types';
import { cn } from '@/shared/ui/cn';
import type { InfraFolderStatusDto } from '../domain/types';
import type { FolderInspection } from '../application/folders';
import { placementPath, type PlacementNode } from '../domain/folder-placement';
import { TREE_TEXT as T } from './structure-texts';

export const LOCATION_TYPE_LABELS: Readonly<Record<LocationType, string>> = {
  site: 'אתר / מתחם',
  building: 'בניין / בית',
  wing: 'אגף',
  floor: 'קומה',
  apartment: 'דירה',
  unit: 'יחידה',
  room: 'חדר',
  area: 'אזור',
  zone: 'מקטע',
  parking: 'חניון',
  basement: 'מרתף',
  roof: 'גג',
  facade: 'חזית',
  infrastructure: 'תשתית',
  other: 'אחר',
};

export interface NodeActions {
  readonly create: (payload: {
    projectId: string;
    parentId: string | null;
    type: LocationType;
    name: string;
    code: string | null;
  }) => Promise<StructureActionResult>;
  readonly addUnits: (payload: {
    projectId: string;
    parentId: string;
    kind: UnitKind;
    count: number;
    startNumber?: number | null;
    rooms?: string[];
  }) => Promise<StructureActionResult>;
  readonly update: (payload: {
    projectId: string;
    locationId: string;
    name?: string;
    code?: string | null;
  }) => Promise<StructureActionResult>;
  readonly move: (payload: { projectId: string; locationId: string; parentId: string | null }) => Promise<StructureActionResult>;
  readonly setUnitKind: (payload: { projectId: string; unitId: string; kind: UnitKind }) => Promise<StructureActionResult>;
  readonly setUnitLevels: (payload: { projectId: string; unitId: string; extraLevelIds: string[] }) => Promise<StructureActionResult>;
  readonly setSpaceLevel: (payload: { projectId: string; spaceId: string; levelId: string | null }) => Promise<StructureActionResult>;
}

function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

type AddMode = 'units' | 'level' | 'space' | 'building' | 'other';

function allowedModes(parent: LocationNode | null): AddMode[] {
  if (!parent) return ['building', 'other'];
  if (isUnitType(parent.type)) return ['space'];
  if (parent.type === 'floor' || parent.type === 'basement') return ['units', 'space'];
  if (parent.type === 'building' || parent.type === 'wing') return ['level', 'units', 'space'];
  if (parent.type === 'site') return ['building', 'space', 'other'];
  return ['space', 'other'];
}

const MODE_LABEL: Record<AddMode, string> = {
  units: T.addUnits,
  level: T.addLevel,
  space: T.addSpace,
  building: T.addBuilding,
  other: T.addChild,
};

/** Adds children under one location: numbered units, a level, a room / area, a building. */
export function AddChildForm({
  projectId,
  parent,
  nodes,
  actions,
  onDone,
}: {
  readonly projectId: string;
  readonly parent: LocationNode | null;
  readonly nodes: readonly LocationNode[];
  readonly actions: NodeActions;
  readonly onDone: (message: string, warning?: string) => void;
}) {
  const modes = allowedModes(parent);
  const [mode, setMode] = useState<AddMode>(modes[0]!);
  const [kind, setKind] = useState<UnitKind>('apartment');
  const [count, setCount] = useState(1);
  const [first, setFirst] = useState('');
  const [rooms, setRooms] = useState('');
  const [name, setName] = useState('');
  const [levelType, setLevelType] = useState<'floor' | 'basement' | 'roof' | 'parking'>('floor');
  const [spaceType, setSpaceType] = useState<'room' | 'area' | 'zone'>('room');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = useMemo(() => (parent ? suggestUnitNumber(nodes, parent.id, kind) : 1), [nodes, parent, kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      let result: StructureActionResult;
      if (mode === 'units' && parent) {
        const startNumber = first.trim() ? Math.max(1, Math.trunc(Number(first))) : null;
        result = await actions.addUnits({
          projectId,
          parentId: parent.id,
          kind,
          count,
          startNumber: Number.isFinite(startNumber) ? startNumber : null,
          rooms: splitList(rooms),
        });
        if (result.ok) onDone(T.unitsAddedToast.replace('{n}', String(count)));
      } else {
        const type: LocationType =
          mode === 'level' ? levelType : mode === 'space' ? spaceType : mode === 'building' ? 'building' : 'other';
        result = await actions.create({ projectId, parentId: parent?.id ?? null, type, name: name.trim(), code: null });
        if (result.ok) onDone(T.createdToast);
      }
      if (!result.ok) setError(result.error);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3"
      data-testid="add-child-form"
    >
      {modes.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={T.actions}>
          {modes.map((candidate) => (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={mode === candidate ? 'primary' : 'secondary'}
              onClick={() => setMode(candidate)}
            >
              {MODE_LABEL[candidate]}
            </Button>
          ))}
        </div>
      ) : null}

      {mode === 'units' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{T.unitType}</span>
            <select className={inputClassName} value={kind} onChange={(event) => setKind(event.target.value as UnitKind)}>
              {UNIT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{T.count}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={WIZARD_LIMITS.unitsPerCell}
              value={count}
              onChange={(event) => setCount(Math.min(Math.max(Math.trunc(Number(event.target.value)) || 1, 1), WIZARD_LIMITS.unitsPerCell))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{T.firstNumber}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={first}
              placeholder={`${T.suggested}: ${suggested}`}
              onChange={(event) => setFirst(event.target.value)}
            />
          </label>
          <p className="col-span-full text-xs text-[var(--pf-text-secondary)]">
            {unitName(kind, Number(first) > 0 ? Number(first) : suggested)}
            {count > 1 ? ` … ${unitName(kind, (Number(first) > 0 ? Number(first) : suggested) + count - 1)}` : ''}
          </p>
          <label className="col-span-full flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{T.roomsOptional}</span>
            <Input value={rooms} onChange={(event) => setRooms(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{T.name}</span>
            <Input value={name} required maxLength={200} autoFocus onChange={(event) => setName(event.target.value)} />
          </label>
          {mode === 'level' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--pf-text-secondary)]">{T.levelType}</span>
              <select className={inputClassName} value={levelType} onChange={(event) => setLevelType(event.target.value as typeof levelType)}>
                <option value="floor">{T.levelFloor}</option>
                <option value="basement">{T.levelBasement}</option>
                <option value="roof">{T.levelRoof}</option>
                <option value="parking">{T.levelParking}</option>
              </select>
            </label>
          ) : null}
          {mode === 'space' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--pf-text-secondary)]">{T.spaceType}</span>
              <select className={inputClassName} value={spaceType} onChange={(event) => setSpaceType(event.target.value as typeof spaceType)}>
                <option value="room">{T.spaceRoom}</option>
                <option value="area">{T.spaceArea}</option>
                <option value="zone">{T.spaceZone}</option>
              </select>
            </label>
          ) : null}
        </div>
      )}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone('')} disabled={pending}>
          {T.close}
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {pending ? T.saving : T.save}
        </Button>
      </div>
    </form>
  );
}

export interface FolderTools {
  readonly canLink: boolean;
  readonly createFolder: (locationId: string) => Promise<string | null>;
  readonly inspect: (locationId: string) => Promise<FolderInspection | string>;
  readonly resolveDrift: (locationId: string, choice: 'adopt_cloud_name' | 'restore_name') => Promise<string | null>;
  readonly recreate: (locationId: string) => Promise<string | null>;
  readonly link: (locationId: string) => void;
  readonly createBranch: (locationId: string) => Promise<string | null>;
}

/** Edits one location: number / name, unit kind, levels, and its (optional) cloud folder. */
export function NodeEditor({
  projectId,
  node,
  nodes,
  folder,
  anchorFolder,
  placementTree,
  actions,
  folderTools,
  onDone,
}: {
  readonly projectId: string;
  readonly node: LocationNode;
  readonly nodes: readonly LocationNode[];
  readonly folder: InfraFolderStatusDto | null;
  readonly anchorFolder: InfraFolderStatusDto | null;
  readonly placementTree: readonly PlacementNode[];
  readonly actions: NodeActions;
  readonly folderTools: FolderTools | null;
  readonly onDone: (message: string, warning?: string) => void;
}) {
  const index = useMemo(() => buildLocationIndex(nodes), [nodes]);
  const unit = isUnitType(node.type);
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? '');
  const [kind, setKind] = useState<UnitKind>((UNIT_KINDS as readonly string[]).includes(node.unitKind ?? '') ? (node.unitKind as UnitKind) : 'apartment');
  const [primary, setPrimary] = useState(node.parentId ?? '');
  const [extra, setExtra] = useState<string[]>([...(node.extraLevelIds ?? [])]);
  const [spaceLevel, setSpaceLevel] = useState(node.levelId ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);
  const [inspection, setInspection] = useState<FolderInspection | null>(null);

  const building = useMemo(() => {
    const path = locationPath(index, node.id);
    for (let i = path.length - 1; i >= 0; i -= 1) if (path[i]!.type === 'building' && path[i]!.id !== node.id) return path[i]!.id;
    return null;
  }, [index, node.id]);

  const sameBuildingLevels = useMemo(
    () =>
      nodes.filter((candidate) => {
        if (candidate.archived || !isLevelType(candidate.type)) return false;
        const path = locationPath(index, candidate.id);
        const container = [...path].reverse().find((item) => item.type === 'building' && item.id !== candidate.id)?.id ?? null;
        return container === building;
      }),
    [nodes, index, building],
  );
  const parentIsLevel = node.parentId ? isLevelType(index.byId.get(node.parentId)?.type ?? 'other') : false;
  const levelNames = unit ? unitLevels(index, node).map((level) => level.name) : [];

  const warnings: string[] = [];
  const run = async (work: () => Promise<StructureActionResult>): Promise<boolean> => {
    const result = await work();
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    // The change itself was saved, but its cloud folder could not be updated: tell the user, never hide it.
    if (result.warning) warnings.push(result.warning);
    return true;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const nextCode = code.trim() || null;
      if (name.trim() !== node.name || nextCode !== node.code) {
        if (!(await run(() => actions.update({ projectId, locationId: node.id, name: name.trim(), code: nextCode })))) return;
      }
      if (unit && kind !== (node.unitKind ?? 'apartment') && !(await run(() => actions.setUnitKind({ projectId, unitId: node.id, kind })))) return;
      if (unit && primary && primary !== node.parentId && !(await run(() => actions.move({ projectId, locationId: node.id, parentId: primary })))) return;
      const nextExtra = extra.filter((id) => id !== primary);
      if (unit && nextExtra.join('|') !== (node.extraLevelIds ?? []).join('|')) {
        if (!(await run(() => actions.setUnitLevels({ projectId, unitId: node.id, extraLevelIds: nextExtra })))) return;
      }
      if (!unit && !isLevelType(node.type) && (spaceLevel || null) !== (node.levelId ?? null)) {
        if (!(await run(() => actions.setSpaceLevel({ projectId, spaceId: node.id, levelId: spaceLevel || null })))) return;
      }
      onDone(T.savedToast, warnings[0]);
    } finally {
      setPending(false);
    }
  };

  const path = placementPath(placementTree, node.id);
  const missing = folder?.status === 'error' && folder.lastError === 'folder_missing';
  const folderLine = folder
    ? missing
      ? T.folderMissing
      : folder.status === 'ready'
        ? folder.origin === 'linked_existing'
          ? T.linkedFolder.replace('{name}', folder.displayName)
          : T.readyFolder.replace('{name}', folder.displayName)
        : T.folderError
    : anchorFolder
      ? T.readyInParent.replace('{name}', anchorFolder.displayName)
      : T.virtual;

  const busy = async (work: () => Promise<string | null>) => {
    setFolderMessage(null);
    setPending(true);
    try {
      setFolderMessage((await work()) ?? null);
    } finally {
      setPending(false);
    }
  };

  const check = () =>
    busy(async () => {
      const result = await folderTools!.inspect(node.id);
      if (typeof result === 'string') return result;
      setInspection(result);
      if (result.state === 'ok') return T.checkOk;
      if (result.state === 'virtual') return T.checkVirtual;
      return null;
    });

  return (
    <form
      onSubmit={save}
      className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3"
      data-testid="node-editor"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{T.name}</span>
          <Input value={name} required maxLength={200} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{T.code}</span>
          <Input value={code} dir="ltr" maxLength={40} onChange={(event) => setCode(event.target.value)} />
        </label>
      </div>

      {unit ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--pf-text-secondary)]">{T.kind}</span>
              <select className={inputClassName} value={kind} onChange={(event) => setKind(event.target.value as UnitKind)}>
                {UNIT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {UNIT_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            {parentIsLevel ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="text-[var(--pf-text-secondary)]">{T.primaryLevel}</span>
                <select className={inputClassName} value={primary} onChange={(event) => setPrimary(event.target.value)}>
                  {sameBuildingLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {parentIsLevel ? (
            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="text-sm font-medium">{T.extraLevels}</legend>
              <p className="text-xs text-[var(--pf-text-secondary)]">{T.extraLevelsHint}</p>
              <div className="flex flex-wrap gap-x-4">
                {sameBuildingLevels
                  .filter((level) => level.id !== primary)
                  .map((level) => (
                    <label key={level.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <Checkbox
                        checked={extra.includes(level.id)}
                        onCheckedChange={(checked) =>
                          setExtra((current) => (checked === true ? [...current, level.id] : current.filter((id) => id !== level.id)))
                        }
                      />
                      {level.name}
                    </label>
                  ))}
              </div>
              {levelNames.length > 1 ? <p className="text-xs text-[var(--pf-text-secondary)]">{levelNames.join(' · ')}</p> : null}
            </fieldset>
          ) : null}
        </>
      ) : null}

      {!unit && !isLevelType(node.type) && sameBuildingLevels.length > 0 && node.type !== 'building' && node.type !== 'site' ? (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{T.spaceLevel}</span>
          <select className={inputClassName} value={spaceLevel} onChange={(event) => setSpaceLevel(event.target.value)}>
            <option value="">{T.spaceLevelNone}</option>
            {sameBuildingLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {folderTools ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2" data-testid="node-folder">
          <span className="text-sm font-medium">{T.cloudSection}</span>
          <span className={cn('text-sm', missing || folder?.status === 'error' ? 'text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-text-secondary)]')}>
            {folderLine}
          </span>
          {path.length > 0 ? (
            <span className="text-xs text-[var(--pf-text-secondary)]">{T.filesGoTo.replace('{path}', path.join(' › '))}</span>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!folder && !anchorFolder ? (
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => busy(() => folderTools.createFolder(node.id))}>
                {T.createFolder}
              </Button>
            ) : null}
            {folder ? (
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void check()}>
                {pending ? T.checking : T.check}
              </Button>
            ) : null}
            {folderTools.canLink ? (
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => folderTools.link(node.id)}>
                {T.link}
              </Button>
            ) : null}
            {!unit && !isLevelType(node.type) ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => busy(() => folderTools.createBranch(node.id))}>
                {T.createForBranch}
              </Button>
            ) : null}
          </div>
          {inspection?.state === 'renamed_outside' ? (
            <div className="flex flex-col gap-2">
              <Alert tone="warning">
                {T.renamedOutside.replace('{cloud}', inspection.cloudName).replace('{system}', inspection.systemName)}
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => busy(async () => {
                  const result = await folderTools.resolveDrift(node.id, 'adopt_cloud_name');
                  if (!result) setInspection(null);
                  return result ?? T.adopted;
                })}>
                  {T.adoptCloudName}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => busy(async () => {
                  const result = await folderTools.resolveDrift(node.id, 'restore_name');
                  if (!result) setInspection(null);
                  return result ?? T.restored;
                })}>
                  {T.restoreName}
                </Button>
              </div>
            </div>
          ) : null}
          {missing || inspection?.state === 'missing' ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => folderTools.link(node.id)}>
                {T.relink}
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => busy(async () => (await folderTools.recreate(node.id)) ?? T.recreated)}>
                {T.recreate}
              </Button>
            </div>
          ) : null}
          {folderMessage ? <p className="text-xs" role="status">{folderMessage}</p> : null}
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone('')} disabled={pending}>
          {T.close}
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {pending ? T.saving : T.save}
        </Button>
      </div>
    </form>
  );
}
