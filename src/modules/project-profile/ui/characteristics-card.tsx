'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import {
  CHARACTERISTIC_AREA_FIELDS,
  CHARACTERISTIC_COUNT_FIELDS,
  CHARACTERISTIC_COUNT_LIMITS,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_METHODS,
  CUSTOM_METADATA_MAX_ENTRIES,
  type CharacteristicAreaField,
  type CharacteristicCountField,
  type ConstructionCategory,
  type ConstructionCharacteristics,
  type ConstructionMethod,
} from '../domain/characteristics';
import type { ProjectStructureActions } from './types';
import { useStructureAction } from './use-structure-action';

type TextFields = Record<CharacteristicCountField | CharacteristicAreaField, string>;

function initialText(value: ConstructionCharacteristics): TextFields {
  const result = {} as TextFields;
  for (const field of CHARACTERISTIC_COUNT_FIELDS) result[field] = value[field] === null ? '' : String(value[field]);
  for (const field of CHARACTERISTIC_AREA_FIELDS) result[field] = value[field] ?? '';
  return result;
}

export function CharacteristicsCard({
  projectId,
  characteristics,
  canEdit,
  saveCharacteristics,
}: {
  readonly projectId: string;
  readonly characteristics: ConstructionCharacteristics;
  readonly canEdit: boolean;
  readonly saveCharacteristics: ProjectStructureActions['saveCharacteristics'];
}) {
  const t = useTranslations('projectProfile');
  const action = useStructureAction();
  const [category, setCategory] = useState<ConstructionCategory | ''>(characteristics.category ?? '');
  const [method, setMethod] = useState<ConstructionMethod | ''>(characteristics.constructionMethod ?? '');
  const [text, setText] = useState<TextFields>(() => initialText(characteristics));
  const [hasPublicAreas, setHasPublicAreas] = useState(characteristics.hasPublicAreas);
  const [metadata, setMetadata] = useState(() =>
    Object.entries(characteristics.customMetadata).map(([key, value]) => ({ key, value })),
  );
  const disabled = !canEdit || action.pending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.run(
      saveCharacteristics,
      {
        projectId,
        category: category || null,
        constructionMethod: method || null,
        ...text,
        hasPublicAreas,
        customMetadata: metadata,
      },
      () => t('characteristics.saved'),
    );
  };

  const setField = (field: keyof TextFields, value: string) => setText((current) => ({ ...current, [field]: value }));

  return (
    <Card id="characteristics">
      <CardHeader>
        <CardTitle>{t('characteristics.title')}</CardTitle>
        <CardDescription>{t('characteristics.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('characteristics.category')}>
              {(props) => (
                <select
                  {...props}
                  className={inputClassName}
                  value={category}
                  disabled={disabled}
                  onChange={(event) => setCategory(event.target.value as ConstructionCategory | '')}
                >
                  <option value="">{t('characteristics.notSet')}</option>
                  {CONSTRUCTION_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`characteristics.categories.${value}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('characteristics.constructionMethod')}>
              {(props) => (
                <select
                  {...props}
                  className={inputClassName}
                  value={method}
                  disabled={disabled}
                  onChange={(event) => setMethod(event.target.value as ConstructionMethod | '')}
                >
                  <option value="">{t('characteristics.notSet')}</option>
                  {CONSTRUCTION_METHODS.map((value) => (
                    <option key={value} value={value}>
                      {t(`characteristics.methods.${value}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t('characteristics.countsGroup')}</legend>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {CHARACTERISTIC_COUNT_FIELDS.map((field) => (
                <Field key={field} label={t(`characteristics.${field}`)} error={action.fieldErrors[field]}>
                  {(props) => (
                    <Input
                      {...props}
                      numeric
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={CHARACTERISTIC_COUNT_LIMITS[field]}
                      step={1}
                      value={text[field]}
                      disabled={disabled}
                      onChange={(event) => setField(field, event.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-3" htmlFor="characteristics-public-areas">
              <Checkbox
                id="characteristics-public-areas"
                checked={hasPublicAreas}
                disabled={disabled}
                onCheckedChange={(checked) => setHasPublicAreas(checked === true)}
              />
              <span className="text-sm">{t('characteristics.hasPublicAreas')}</span>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t('characteristics.areasGroup')}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CHARACTERISTIC_AREA_FIELDS.map((field) => (
                <Field key={field} label={t(`characteristics.${field}`)} error={action.fieldErrors[field]}>
                  {(props) => (
                    <Input
                      {...props}
                      numeric
                      inputMode="decimal"
                      value={text[field]}
                      disabled={disabled}
                      onChange={(event) => setField(field, event.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{t('characteristics.customMetadata')}</legend>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('characteristics.customMetadataHint')}</p>
            {metadata.map((entry, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Input
                  aria-label={t('characteristics.metadataKey')}
                  placeholder={t('characteristics.metadataKey')}
                  value={entry.key}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) =>
                    setMetadata((rows) => rows.map((row, i) => (i === index ? { ...row, key: event.target.value } : row)))
                  }
                />
                <Input
                  aria-label={t('characteristics.metadataValue')}
                  placeholder={t('characteristics.metadataValue')}
                  value={entry.value}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) =>
                    setMetadata((rows) => rows.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))
                  }
                />
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('characteristics.removeMetadata')}
                    disabled={disabled}
                    onClick={() => setMetadata((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            {canEdit && metadata.length < CUSTOM_METADATA_MAX_ENTRIES ? (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setMetadata((rows) => [...rows, { key: '', value: '' }])}
                >
                  <Plus aria-hidden />
                  {t('characteristics.addMetadata')}
                </Button>
              </div>
            ) : null}
          </fieldset>

          {action.error ? (
            <Alert tone="danger" role="alert">
              <p className="text-sm">{action.error}</p>
            </Alert>
          ) : null}
          {action.status ? <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">{action.status}</p> : null}

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" loading={action.pending} className="w-full sm:w-auto">
                {t('characteristics.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
