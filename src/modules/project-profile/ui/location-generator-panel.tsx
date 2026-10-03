'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import {
  GENERATOR_LIMITS,
  countGeneratedNodes,
  validateGeneratorSpec,
  type LocationGeneratorSpec,
} from '../domain/location-generator';
import type { LocationNode } from '../domain/locations';
import { LocationPicker } from './location-picker';
import type { ProjectStructureActions } from './types';
import { useStructureAction } from './use-structure-action';

const DEFAULT_SPEC: LocationGeneratorSpec = {
  buildings: 1,
  buildingCodeStyle: 'letters',
  floorsAboveGround: 4,
  floorsBelowGround: 0,
  includeGroundFloor: true,
  unitsPerFloor: 4,
  unitType: 'apartment',
  unitsOnGroundFloor: false,
  unitNumbering: 'per_building',
  undergroundAsParking: false,
  includeRoof: false,
};

type NumberField = 'buildings' | 'floorsAboveGround' | 'floorsBelowGround' | 'unitsPerFloor';
type BooleanField = 'includeGroundFloor' | 'unitsOnGroundFloor' | 'undergroundAsParking' | 'includeRoof';

const NUMBER_FIELDS: readonly { field: NumberField; min: number; max: number }[] = [
  { field: 'buildings', min: 1, max: GENERATOR_LIMITS.buildings },
  { field: 'floorsAboveGround', min: 0, max: GENERATOR_LIMITS.floorsAboveGround },
  { field: 'floorsBelowGround', min: 0, max: GENERATOR_LIMITS.floorsBelowGround },
  { field: 'unitsPerFloor', min: 0, max: GENERATOR_LIMITS.unitsPerFloor },
];
const BOOLEAN_FIELDS: readonly BooleanField[] = [
  'includeGroundFloor',
  'unitsOnGroundFloor',
  'undergroundAsParking',
  'includeRoof',
];

export function LocationGeneratorPanel({
  projectId,
  locations,
  generateLocations,
}: {
  readonly projectId: string;
  readonly locations: readonly LocationNode[];
  readonly generateLocations: ProjectStructureActions['generateLocations'];
}) {
  const t = useTranslations('projectProfile');
  const action = useStructureAction();
  const [spec, setSpec] = useState<LocationGeneratorSpec>(DEFAULT_SPEC);
  const [raw, setRaw] = useState<Record<NumberField, string>>({
    buildings: String(DEFAULT_SPEC.buildings),
    floorsAboveGround: String(DEFAULT_SPEC.floorsAboveGround),
    floorsBelowGround: String(DEFAULT_SPEC.floorsBelowGround),
    unitsPerFloor: String(DEFAULT_SPEC.unitsPerFloor),
  });
  const [parentId, setParentId] = useState<string | null>(null);

  const issues = validateGeneratorSpec(spec);
  const count = issues.length === 0 ? countGeneratedNodes(spec) : 0;
  const activeLocations = locations.filter((node) => !node.archived);

  const setNumber = (field: NumberField, value: string) => {
    setRaw((current) => ({ ...current, [field]: value }));
    const parsed = Number(value);
    setSpec((current) => ({ ...current, [field]: value.trim() === '' || !Number.isFinite(parsed) ? -1 : parsed }));
  };

  const submit = () => {
    action.run(
      generateLocations,
      { projectId, parentId, spec },
      (result) => t('generator.generated', { count: result.count ?? count }),
    );
  };

  return (
    <CollapsibleSection title={t('generator.open')} summary={t('generator.description')}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('generator.description')}</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {NUMBER_FIELDS.map(({ field, min, max }) => (
            <Field key={field} label={t(`generator.${field}`)}>
              {(props) => (
                <Input
                  {...props}
                  numeric
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  value={raw[field]}
                  disabled={action.pending}
                  onChange={(event) => setNumber(field, event.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t('generator.buildingCodeStyle')}>
            {(props) => (
              <select
                {...props}
                className={inputClassName}
                value={spec.buildingCodeStyle}
                disabled={action.pending}
                onChange={(event) =>
                  setSpec((current) => ({ ...current, buildingCodeStyle: event.target.value as 'letters' | 'numbers' }))
                }
              >
                <option value="letters">{t('generator.codeLetters')}</option>
                <option value="numbers">{t('generator.codeNumbers')}</option>
              </select>
            )}
          </Field>
          <Field label={t('generator.unitType')}>
            {(props) => (
              <select
                {...props}
                className={inputClassName}
                value={spec.unitType}
                disabled={action.pending}
                onChange={(event) =>
                  setSpec((current) => ({ ...current, unitType: event.target.value as 'apartment' | 'unit' }))
                }
              >
                <option value="apartment">{t('locationTypes.apartment')}</option>
                <option value="unit">{t('locationTypes.unit')}</option>
              </select>
            )}
          </Field>
          <Field label={t('generator.numbering')}>
            {(props) => (
              <select
                {...props}
                className={inputClassName}
                value={spec.unitNumbering}
                disabled={action.pending}
                onChange={(event) =>
                  setSpec((current) => ({
                    ...current,
                    unitNumbering: event.target.value as 'per_building' | 'per_floor',
                  }))
                }
              >
                <option value="per_building">{t('generator.numberingPerBuilding')}</option>
                <option value="per_floor">{t('generator.numberingPerFloor')}</option>
              </select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BOOLEAN_FIELDS.map((field) => (
            <label key={field} htmlFor={`generator-${field}`} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`generator-${field}`}
                checked={spec[field]}
                disabled={action.pending}
                onCheckedChange={(checked) => setSpec((current) => ({ ...current, [field]: checked === true }))}
              />
              <span className="text-sm">{t(`generator.${field}`)}</span>
            </label>
          ))}
        </div>
        <Field label={t('generator.parent')}>
          {(props) => (
            <LocationPicker
              {...props}
              locations={activeLocations}
              value={parentId}
              onChange={setParentId}
              disabled={action.pending}
            />
          )}
        </Field>

        {issues.length > 0 ? (
          <Alert tone="warning" role="status">
            <p className="text-sm">{t(`errors.generator.${issues[0]}`)}</p>
          </Alert>
        ) : (
          <p className="text-sm font-medium" role="status">
            {t('generator.preview', { count })}
          </p>
        )}
        {action.error ? (
          <Alert tone="danger" role="alert">
            <p className="text-sm">{action.error}</p>
          </Alert>
        ) : null}
        {action.status ? <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">{action.status}</p> : null}
        <div className="flex justify-end">
          <Button
            type="button"
            loading={action.pending}
            disabled={issues.length > 0}
            className="w-full sm:w-auto"
            onClick={submit}
          >
            {t('generator.generate')}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
