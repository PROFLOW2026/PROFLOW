'use client';

import { useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, inputClassName } from '@/components/ui/input';
import {
  OPTIONAL_ROOMS,
  ROOM_COUNTS,
  UNIT_KINDS,
  WIZARD_LIMITS,
  WIZARD_TEMPLATES,
  buildingName,
  countPlannedNodes,
  defaultAreas,
  defaultBuilding,
  emptySpec,
  levelName,
  makeLevels,
  orderLevels,
  planStructure,
  roomTemplate,
  summarizePlan,
  validateWizardSpec,
  type UnitKind,
  type WizardBuilding,
  type WizardIssue,
  type WizardLevel,
  type WizardMultiLevel,
  type WizardSpec,
  type WizardTemplate,
} from '@/modules/project-profile/domain/structure-wizard';
import type { CreateStructurePayload, StructureActionResult } from '@/modules/project-profile/ui/types';
import { cn } from '@/shared/ui/cn';
import { CountField } from './count-field';
import { STRUCTURE_TEXT as T } from './structure-texts';

interface LevelForm {
  readonly basements: number;
  readonly ground: boolean;
  readonly floors: number;
  readonly roof: boolean;
  readonly special: string;
}

const KINDS_BY_TEMPLATE: Record<WizardTemplate, readonly UnitKind[]> = {
  residential: ['apartment', 'penthouse'],
  house: [],
  commercial: ['shop', 'office'],
  mixed: ['apartment', 'shop', 'office'],
  infrastructure: [],
  custom: ['apartment', 'shop', 'office', 'other'],
};

const RESIDENTIAL_TEMPLATES: readonly WizardTemplate[] = ['residential', 'mixed', 'custom'];

function formOf(building: WizardBuilding): LevelForm {
  return {
    basements: building.levels.filter((level) => level.kind === 'basement').length,
    ground: building.levels.some((level) => level.kind === 'ground'),
    floors: building.levels.filter((level) => level.kind === 'floor').length,
    roof: building.levels.some((level) => level.kind === 'roof'),
    special: building.levels
      .filter((level) => level.kind === 'special')
      .map((level) => level.label ?? '')
      .join(', '),
  };
}

/** Rebuilds a building's levels from the simple counts, keeping the unit counts of levels that stay. */
function applyForm(building: WizardBuilding, form: LevelForm, fallback: WizardLevel['units']): WizardBuilding {
  const previous = new Map(building.levels.map((level) => [level.key, level.units]));
  const special = form.special
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .slice(0, 20);
  const levels = makeLevels(
    {
      basements: Math.min(Math.max(form.basements, 0), 20),
      ground: form.ground,
      floorsAboveGround: Math.min(Math.max(form.floors, 0), 99),
      roof: form.roof,
      special,
    },
    (level) => previous.get(level.key) ?? (level.kind === 'floor' ? fallback : {}),
  );
  return { ...building, levels };
}

/**
 * Plain-language reasons the wizard cannot move on. Every blocked "continue" / "create" shows these next to
 * the button, so a disabled button is never unexplained. `multiProblem` carries the multi-level detail.
 */
function issueMessages(issues: readonly WizardIssue[]): string[] {
  return issues.map((issue) => T.issues[issue]);
}

/** Why one multi-level unit cannot be built (shown inside its own row), or null when it is fine. */
function multiProblem(spec: WizardSpec, link: WizardMultiLevel): string | null {
  const building = spec.buildings[link.buildingIndex];
  const primary = building?.levels.find((level) => level.key === link.levelKey);
  if (!building || !primary) return T.multiProblemLevel;
  const count = primary.units[link.kind] ?? 0;
  if (count === 0) return T.multiProblemNone;
  if (link.ordinal > count) return T.multiProblemOrdinal.replace('{n}', String(count));
  if (link.extraLevelKeys.length === 0) return T.multiProblemExtra;
  return null;
}

function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Three short steps: project type, floors and units, summary. It only describes database rows; nothing is
 * created in the customer's cloud (folders appear on the first upload).
 */
export function StructureWizard({
  projectId,
  parentId,
  createStructure,
  onCreated,
  onCancel,
}: {
  readonly projectId: string;
  readonly parentId: string | null;
  readonly createStructure: (payload: CreateStructurePayload) => Promise<StructureActionResult>;
  readonly onCreated: (count: number) => void;
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<WizardTemplate>('residential');
  const [spec, setSpec] = useState<WizardSpec>(() => emptySpec('residential'));
  const [sameForAll, setSameForAll] = useState(true);
  const [buildingIndex, setBuildingIndex] = useState(0);
  const [areasText, setAreasText] = useState('');
  const [moreKinds, setMoreKinds] = useState(false);
  const [roomCount, setRoomCount] = useState(0);
  const [optionalRooms, setOptionalRooms] = useState<readonly string[]>([]);
  const [customRooms, setCustomRooms] = useState('');
  const [quickKind, setQuickKind] = useState<UnitKind>('apartment');
  const [quickCount, setQuickCount] = useState(4);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const base = new Set<UnitKind>(KINDS_BY_TEMPLATE[template]);
    for (const building of spec.buildings) {
      for (const level of building.levels) {
        for (const kind of UNIT_KINDS) if ((level.units[kind] ?? 0) > 0) base.add(kind);
      }
    }
    return UNIT_KINDS.filter((kind) => moreKinds || base.has(kind));
  }, [template, spec.buildings, moreKinds]);

  const rooms = useMemo(() => {
    if (roomCount === 0 || !RESIDENTIAL_TEMPLATES.includes(template)) return [] as string[];
    return [...roomTemplate(roomCount).core, ...optionalRooms, ...splitList(customRooms)];
  }, [roomCount, optionalRooms, customRooms, template]);

  const fullSpec: WizardSpec = useMemo(
    () => ({ ...spec, areas: template === 'infrastructure' || template === 'custom' ? splitList(areasText) : [], rooms }),
    [spec, areasText, rooms, template],
  );
  const issues = useMemo(() => validateWizardSpec(fullSpec), [fullSpec]);
  const plan = useMemo(() => (issues.length === 0 ? planStructure(fullSpec) : null), [issues, fullSpec]);
  const summary = useMemo(() => (plan ? summarizePlan(plan) : null), [plan]);
  const plannedCount = useMemo(() => countPlannedNodes(fullSpec), [fullSpec]);

  const pickTemplate = (next: WizardTemplate) => {
    setTemplate(next);
    setSpec(emptySpec(next));
    setAreasText(next === 'infrastructure' ? defaultAreas(3).join('\n') : '');
    setBuildingIndex(0);
    setRoomCount(0);
    setOptionalRooms([]);
    setCustomRooms('');
    setQuickKind(KINDS_BY_TEMPLATE[next][0] ?? 'apartment');
  };

  const setBuildings = (buildings: readonly WizardBuilding[]) =>
    setSpec((current) => ({
      ...current,
      buildings,
      multiLevel: current.multiLevel.filter((link) => link.buildingIndex < buildings.length),
    }));

  const changeBuildingCount = (count: number) => {
    const wanted = Math.min(Math.max(count, 0), WIZARD_LIMITS.buildings);
    const current = spec.buildings;
    if (wanted === current.length) return;
    if (wanted < current.length) return setBuildings(current.slice(0, wanted));
    const source = current[0] ?? defaultBuilding(template, 0);
    const added = Array.from({ length: wanted - current.length }, (_, offset) => ({
      ...source,
      name: buildingName(template, current.length + offset),
    }));
    setBuildings([...current, ...added]);
  };

  const fallbackUnits = (building: WizardBuilding): WizardLevel['units'] =>
    building.levels.find((level) => level.kind === 'floor')?.units ??
    defaultBuilding(template, 0).levels.find((level) => level.kind === 'floor')?.units ??
    {};

  const changeForm = (index: number, patch: Partial<LevelForm>) => {
    const targets = sameForAll ? spec.buildings.map((_, i) => i) : [index];
    setBuildings(
      spec.buildings.map((building, i) =>
        targets.includes(i) ? applyForm(building, { ...formOf(building), ...patch }, fallbackUnits(spec.buildings[0] ?? building)) : building,
      ),
    );
  };

  const renameBuilding = (index: number, name: string) =>
    setBuildings(spec.buildings.map((building, i) => (i === index ? { ...building, name } : building)));

  const setUnits = (index: number, levelKey: string, kind: UnitKind, value: number) => {
    const targets = sameForAll ? spec.buildings.map((_, i) => i) : [index];
    setBuildings(
      spec.buildings.map((building, i) =>
        targets.includes(i)
          ? {
              ...building,
              levels: building.levels.map((level) =>
                level.key === levelKey ? { ...level, units: { ...level.units, [kind]: value } } : level,
              ),
            }
          : building,
      ),
    );
  };

  const applyQuick = () => {
    const targets = sameForAll ? spec.buildings.map((_, i) => i) : [buildingIndex];
    setBuildings(
      spec.buildings.map((building, i) =>
        targets.includes(i)
          ? {
              ...building,
              levels: building.levels.map((level) =>
                level.kind === 'floor' ? { ...level, units: { ...level.units, [quickKind]: quickCount } } : level,
              ),
            }
          : building,
      ),
    );
  };

  const active = spec.buildings[Math.min(buildingIndex, Math.max(spec.buildings.length - 1, 0))];
  const isHouse = template === 'house';

  const addMultiLevel = () => {
    const bi = sameForAll ? 0 : Math.min(buildingIndex, spec.buildings.length - 1);
    const building = spec.buildings[bi];
    if (!building) return;
    for (const level of orderLevels(building.levels)) {
      for (const kind of UNIT_KINDS) {
        if ((level.units[kind] ?? 0) <= 0) continue;
        const other = building.levels.find((candidate) => candidate.key !== level.key);
        if (!other) return;
        setSpec((current) => ({
          ...current,
          multiLevel: [...current.multiLevel, { buildingIndex: bi, levelKey: level.key, kind, ordinal: 1, extraLevelKeys: [other.key] }],
        }));
        return;
      }
    }
  };

  const updateMulti = (index: number, patch: Partial<WizardMultiLevel>) =>
    setSpec((current) => ({
      ...current,
      multiLevel: current.multiLevel.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }));

  // Set synchronously so a fast double tap can never start a second creation before React re-renders.
  const submitting = useRef(false);
  const create = async () => {
    if (submitting.current || issues.length > 0) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createStructure({ projectId, parentId, spec: fullSpec });
      if (result.ok) onCreated(result.count ?? plannedCount);
      else setError(result.error);
    } catch {
      setError(T.createFailed);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  // The wizard only moves on when the definition is valid, and always says why it cannot.
  const blockers = issueMessages(issues);
  const canContinue = issues.length === 0;

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 sm:p-4"
      aria-label={T.open}
      data-testid="structure-wizard"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{T.open}</h3>
        <span className="text-xs text-[var(--pf-text-secondary)]">{T.stepOf.replace('{n}', String(step))}</span>
      </div>

      {step === 1 ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h4 className="text-sm font-medium">{T.step1Title}</h4>
            <p className="text-xs text-[var(--pf-text-secondary)]">{T.step1Hint}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={T.step1Title}>
            {WIZARD_TEMPLATES.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={template === key}
                onClick={() => pickTemplate(key)}
                data-testid={`wizard-template-${key}`}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-start gap-0.5 rounded-md border p-3 text-start',
                  template === key
                    ? 'border-[var(--pf-border-brand)] bg-[var(--pf-bg-muted)]'
                    : 'border-[var(--pf-border-default)] hover:bg-[var(--pf-bg-muted)]',
                )}
              >
                <span className="text-sm font-medium">{T.templates[key].title}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{T.templates[key].hint}</span>
              </button>
            ))}
          </div>

          {template !== 'infrastructure' ? (
            <div className="flex min-w-0 flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CountField
                  id="wizard-building-count"
                  label={isHouse ? T.houseCount : T.buildingCount}
                  value={spec.buildings.length}
                  min={template === 'custom' ? 0 : 1}
                  max={WIZARD_LIMITS.buildings}
                  hint={T.fieldRequired.replace('{n}', '1')}
                  onChange={changeBuildingCount}
                />
                {spec.buildings.length > 1 || spec.siteName ? (
                  <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="wizard-site">
                    <span className="text-[var(--pf-text-secondary)]">{T.site}</span>
                    <Input
                      id="wizard-site"
                      value={spec.siteName ?? ''}
                      maxLength={WIZARD_LIMITS.nameLength}
                      placeholder={T.siteHint}
                      onChange={(event) => setSpec({ ...spec, siteName: event.target.value || null })}
                    />
                  </label>
                ) : null}
              </div>
              {spec.buildings.length > 1 ? (
                <label className="flex min-h-11 items-center gap-3" htmlFor="wizard-same">
                  <Checkbox id="wizard-same" checked={sameForAll} onCheckedChange={(checked) => setSameForAll(checked === true)} />
                  <span className="text-sm">{T.sameForAll}</span>
                </label>
              ) : null}

              {(sameForAll ? spec.buildings.slice(0, 1) : spec.buildings).map((building, shown) => {
                const index = sameForAll ? 0 : shown;
                const form = formOf(building);
                return (
                  <fieldset key={index} className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
                    {!sameForAll || spec.buildings.length === 1 ? (
                      <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor={`wizard-bname-${index}`}>
                        <span className="text-[var(--pf-text-secondary)]">{T.buildingName}</span>
                        <Input
                          id={`wizard-bname-${index}`}
                          value={building.name}
                          maxLength={WIZARD_LIMITS.nameLength}
                          onChange={(event) => renameBuilding(index, event.target.value)}
                        />
                      </label>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <CountField
                        id={`wizard-floors-${index}`}
                        label={T.floors}
                        value={form.floors}
                        max={99}
                        onChange={(value) => changeForm(index, { floors: value })}
                      />
                      <CountField
                        id={`wizard-basements-${index}`}
                        label={T.basements}
                        value={form.basements}
                        max={20}
                        onChange={(value) => changeForm(index, { basements: value })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-6">
                      <label className="flex min-h-11 items-center gap-3" htmlFor={`wizard-ground-${index}`}>
                        <Checkbox
                          id={`wizard-ground-${index}`}
                          checked={form.ground}
                          onCheckedChange={(checked) => changeForm(index, { ground: checked === true })}
                        />
                        <span className="text-sm">{T.ground}</span>
                      </label>
                      <label className="flex min-h-11 items-center gap-3" htmlFor={`wizard-roof-${index}`}>
                        <Checkbox
                          id={`wizard-roof-${index}`}
                          checked={form.roof}
                          onCheckedChange={(checked) => changeForm(index, { roof: checked === true })}
                        />
                        <span className="text-sm">{T.roof}</span>
                      </label>
                    </div>
                    <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor={`wizard-special-${index}`}>
                      <span className="text-[var(--pf-text-secondary)]">{T.special}</span>
                      <Input
                        id={`wizard-special-${index}`}
                        value={form.special}
                        placeholder={T.specialPlaceholder}
                        onChange={(event) => changeForm(index, { special: event.target.value })}
                      />
                    </label>
                  </fieldset>
                );
              })}
            </div>
          ) : null}

          {template === 'infrastructure' || template === 'custom' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="wizard-areas">
              <span className="font-medium">{T.areasTitle}</span>
              <span className="text-xs text-[var(--pf-text-secondary)]">{T.areasHint}</span>
              <textarea
                id="wizard-areas"
                className={cn(inputClassName, 'min-h-24')}
                value={areasText}
                onChange={(event) => setAreasText(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h4 className="text-sm font-medium">{T.step2Title}</h4>
            {!isHouse && spec.buildings.length > 0 ? <p className="text-xs text-[var(--pf-text-secondary)]">{T.unitsHint}</p> : null}
            {isHouse ? <p className="text-xs text-[var(--pf-text-secondary)]">{T.houseNote}</p> : null}
          </div>

          {spec.buildings.length > 1 && !sameForAll ? (
            <select
              className={inputClassName}
              aria-label={T.building}
              value={buildingIndex}
              onChange={(event) => setBuildingIndex(Number(event.target.value))}
            >
              {spec.buildings.map((building, index) => (
                <option key={index} value={index}>
                  {building.name}
                </option>
              ))}
            </select>
          ) : null}

          {active && !isHouse ? (
            <>
              <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-md bg-[var(--pf-bg-muted)] p-3">
                <span className="w-full text-xs font-medium">{T.sameCount}</span>
                <select
                  className={cn(inputClassName, 'w-auto')}
                  aria-label={T.multiKind}
                  value={quickKind}
                  onChange={(event) => setQuickKind(event.target.value as UnitKind)}
                >
                  {(kinds.length > 0 ? kinds : UNIT_KINDS).map((kind) => (
                    <option key={kind} value={kind}>
                      {T.unitKinds[kind]}
                    </option>
                  ))}
                </select>
                <CountField
                  className="w-20"
                  aria-label={T.sameCount}
                  value={quickCount}
                  max={WIZARD_LIMITS.unitsPerCell}
                  onChange={setQuickCount}
                />
                <Button type="button" variant="secondary" size="sm" onClick={applyQuick}>
                  {T.apply}
                </Button>
              </div>

              <ul className="flex min-w-0 flex-col gap-2">
                {orderLevels(active.levels).map((level) => (
                  <li
                    key={level.key}
                    className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 rounded-md border border-[var(--pf-border-default)] p-2"
                    data-testid="wizard-level-row"
                  >
                    <span className="min-w-24 flex-1 text-sm font-medium">{levelName(level)}</span>
                    {kinds.map((kind) => (
                      <label key={kind} className="flex w-20 min-w-0 flex-col gap-0.5 text-xs" htmlFor={`wizard-u-${level.key}-${kind}`}>
                        <span className="truncate text-[var(--pf-text-secondary)]">{T.unitKinds[kind]}</span>
                        <CountField
                          id={`wizard-u-${level.key}-${kind}`}
                          aria-label={`${levelName(level)} - ${T.unitKinds[kind]}`}
                          max={WIZARD_LIMITS.unitsPerCell}
                          value={level.units[kind] ?? 0}
                          onChange={(value) => setUnits(buildingIndex, level.key, kind, value)}
                        />
                      </label>
                    ))}
                  </li>
                ))}
              </ul>
              <button type="button" className="self-start text-xs underline" onClick={() => setMoreKinds((value) => !value)}>
                {T.moreKinds}
              </button>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{T.numbering}</span>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="wizard-numbering"
                    checked={spec.numbering === 'sequential'}
                    onChange={() => setSpec({ ...spec, numbering: 'sequential' })}
                  />
                  {T.numberingSequential}
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="wizard-numbering"
                    checked={spec.numbering === 'per_level'}
                    onChange={() => setSpec({ ...spec, numbering: 'per_level' })}
                  />
                  {T.numberingPerLevel}
                </label>
                <p className="text-xs text-[var(--pf-text-secondary)]">{T.numberingHint}</p>
              </div>

              <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
                <span className="text-sm font-medium">{T.multiTitle}</span>
                <p className="text-xs text-[var(--pf-text-secondary)]">{T.multiHint}</p>
                {spec.multiLevel.map((link, index) => {
                  const building = spec.buildings[link.buildingIndex];
                  if (!building) return null;
                  const primary = building.levels.find((level) => level.key === link.levelKey);
                  const count = primary?.units[link.kind] ?? 0;
                  const problem = multiProblem(spec, link);
                  return (
                    <div key={index} className="flex min-w-0 flex-col gap-2 rounded-md bg-[var(--pf-bg-muted)] p-2" data-testid="wizard-multi-row">
                      {problem ? (
                        <p role="alert" className="text-xs text-[var(--pf-text-danger)]" data-testid="wizard-multi-problem">
                          {problem}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-end gap-2">
                        {spec.buildings.length > 1 ? (
                          <select
                            className={cn(inputClassName, 'w-auto')}
                            aria-label={T.building}
                            value={link.buildingIndex}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const first = spec.buildings[next]?.levels[0];
                              updateMulti(index, { buildingIndex: next, levelKey: first?.key ?? link.levelKey, extraLevelKeys: [] });
                            }}
                          >
                            {spec.buildings.map((candidate, i) => (
                              <option key={i} value={i}>
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <select
                          className={cn(inputClassName, 'w-auto')}
                          aria-label={T.multiLevel}
                          value={link.levelKey}
                          onChange={(event) =>
                            updateMulti(index, {
                              levelKey: event.target.value,
                              extraLevelKeys: link.extraLevelKeys.filter((key) => key !== event.target.value),
                            })
                          }
                        >
                          {orderLevels(building.levels).map((level) => (
                            <option key={level.key} value={level.key}>
                              {levelName(level)}
                            </option>
                          ))}
                        </select>
                        <select
                          className={cn(inputClassName, 'w-auto')}
                          aria-label={T.multiKind}
                          value={link.kind}
                          onChange={(event) => updateMulti(index, { kind: event.target.value as UnitKind })}
                        >
                          {UNIT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {T.unitKinds[kind]}
                            </option>
                          ))}
                        </select>
                        <CountField
                          className="w-24 text-xs"
                          label={T.multiOrdinal}
                          min={1}
                          max={Math.max(count, 1)}
                          value={link.ordinal}
                          onChange={(value) => updateMulti(index, { ordinal: value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSpec({ ...spec, multiLevel: spec.multiLevel.filter((_, i) => i !== index) })}
                        >
                          {T.multiRemove}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-x-4">
                        <span className="w-full text-xs text-[var(--pf-text-secondary)]">{T.multiExtra}</span>
                        {orderLevels(building.levels)
                          .filter((level) => level.key !== link.levelKey)
                          .map((level) => (
                            <label key={level.key} className="flex min-h-11 items-center gap-2 text-sm">
                              <Checkbox
                                checked={link.extraLevelKeys.includes(level.key)}
                                onCheckedChange={(checked) =>
                                  updateMulti(index, {
                                    extraLevelKeys:
                                      checked === true
                                        ? [...link.extraLevelKeys, level.key]
                                        : link.extraLevelKeys.filter((key) => key !== level.key),
                                  })
                                }
                              />
                              {levelName(level)}
                            </label>
                          ))}
                      </div>
                    </div>
                  );
                })}
                <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addMultiLevel}>
                  {T.multiAdd}
                </Button>
              </div>
            </>
          ) : null}

          {RESIDENTIAL_TEMPLATES.includes(template) ? (
            <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
              <span className="text-sm font-medium">{T.roomsTitle}</span>
              <p className="text-xs text-[var(--pf-text-secondary)]">{T.roomsHint}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={T.roomsTitle}>
                <Button type="button" size="sm" variant={roomCount === 0 ? 'primary' : 'secondary'} onClick={() => setRoomCount(0)}>
                  {T.roomsNone}
                </Button>
                {ROOM_COUNTS.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    size="sm"
                    variant={roomCount === count ? 'primary' : 'secondary'}
                    onClick={() => setRoomCount(count)}
                  >
                    {T.roomsCount.replace('{n}', String(count))}
                  </Button>
                ))}
              </div>
              {roomCount > 0 ? (
                <>
                  <div className="flex flex-wrap gap-x-4">
                    <span className="w-full text-xs text-[var(--pf-text-secondary)]">{T.roomsOptional}</span>
                    {OPTIONAL_ROOMS.map((room) => (
                      <label key={room} className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox
                          checked={optionalRooms.includes(room)}
                          onCheckedChange={(checked) =>
                            setOptionalRooms((current) => (checked === true ? [...current, room] : current.filter((item) => item !== room)))
                          }
                        />
                        {room}
                      </label>
                    ))}
                  </div>
                  <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="wizard-rooms-custom">
                    <span className="text-[var(--pf-text-secondary)]">{T.roomsCustom}</span>
                    <Input id="wizard-rooms-custom" value={customRooms} onChange={(event) => setCustomRooms(event.target.value)} />
                  </label>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {T.roomsList}: {rooms.join(', ')}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex min-w-0 flex-col gap-3" data-testid="wizard-preview">
          <h4 className="text-sm font-medium">{T.step3Title}</h4>
          {summary ? (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {(
                  [
                    [T.previewBuildings, summary.buildings],
                    [T.previewLevels, summary.levels],
                    [T.previewUnits, summary.units],
                    [T.previewMulti, summary.multiLevelUnits],
                    [T.previewSpaces, summary.spaces],
                    [T.previewAreas, summary.areas],
                  ] as const
                )
                  .filter(([, value]) => value > 0)
                  .map(([label, value]) => (
                    <div key={label} className="rounded-md bg-[var(--pf-bg-muted)] p-2">
                      <dt className="text-xs text-[var(--pf-text-secondary)]">{label}</dt>
                      <dd className="text-base font-semibold">{value}</dd>
                    </div>
                  ))}
              </dl>
              <ul className="flex max-h-56 min-w-0 flex-col gap-1 overflow-y-auto text-sm">
                {summary.byBuilding.map((building) => (
                  <li key={building.name} className="min-w-0">
                    <span className="font-medium">{building.name}</span>
                    <span className="text-xs text-[var(--pf-text-secondary)]">
                      {' '}
                      {building.levels
                        .map((level) => (level.units > 0 ? `${level.name} (${level.units})` : level.name))
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {T.previewTotal}: {plannedCount}. {T.previewNoFolders}
              </p>
            </>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      ) : null}

      {blockers.length > 0 ? (
        <Alert tone="danger" data-testid="wizard-blockers">
          <p className="font-medium">{T.blockedTitle}</p>
          <ul className="list-disc ps-5">
            {blockers.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={step === 1 ? onCancel : () => setStep((step - 1) as 1 | 2)} disabled={pending}>
          {step === 1 ? T.cancel : T.back}
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={() => setStep((step + 1) as 2 | 3)} disabled={!canContinue} data-testid="wizard-next">
            {T.next}
          </Button>
        ) : (
          <Button type="button" onClick={() => void create()} loading={pending} disabled={issues.length > 0} data-testid="wizard-create">
            {pending ? T.creating : T.create}
          </Button>
        )}
      </div>
    </section>
  );
}
