'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { inputClassName } from '@/components/ui/input';
import { SUBCONTRACT_LINE_TYPES } from '../domain/types';

export interface VersionLineOption {
  readonly id: string;
  readonly label: string;
}

/** Repeating rows named `lines.<n>.*` (parsed by the server action). */
export function VersionLinesEditor({ lineOptions }: { lineOptions: readonly VersionLineOption[] }) {
  const t = useTranslations('subcontracts');
  const [rows, setRows] = React.useState<number[]>([]);
  const [targets, setTargets] = React.useState<Record<number, string>>({});
  const nextId = React.useRef(0);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{t('versions.linesTitle')}</legend>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('versions.linesHint')}</p>
      {rows.map((row, position) => {
        const target = targets[row] ?? '';
        const prefix = `lines.${position}.`;
        return (
          <div
            key={row}
            className="grid grid-cols-1 gap-2 rounded-md border border-[var(--pf-border-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className="flex flex-col gap-1 text-xs lg:col-span-2">
              {t('versions.target')}
              <select
                name={`${prefix}target`}
                className={inputClassName}
                value={target}
                onChange={(event) => setTargets((current) => ({ ...current, [row]: event.target.value }))}
              >
                <option value="">{t('versions.chooseTarget')}</option>
                {lineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
                <option value="new">{t('versions.newLine')}</option>
              </select>
            </label>
            {target === 'new' ? (
              <>
                <label className="flex flex-col gap-1 text-xs lg:col-span-2">
                  {t('lines.fields.description')}
                  <input name={`${prefix}newLineDescription`} className={inputClassName} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t('lines.fields.unit')}
                  <input name={`${prefix}newLineUnit`} className={inputClassName} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t('lines.fields.lineType')}
                  <select name={`${prefix}newLineType`} className={inputClassName} defaultValue="lump_sum">
                    {SUBCONTRACT_LINE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`lineTypes.${type}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="flex flex-col gap-1 text-xs">
              {t('versions.quantityDelta')}
              <input name={`${prefix}quantityDelta`} inputMode="decimal" dir="ltr" className={inputClassName} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('versions.unitRate')}
              <input name={`${prefix}unitRate`} inputMode="decimal" dir="ltr" className={inputClassName} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('versions.amountDelta')}
              <input name={`${prefix}amountDelta`} inputMode="decimal" dir="ltr" className={inputClassName} />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="dangerGhost"
                size="sm"
                onClick={() => setRows((current) => current.filter((candidate) => candidate !== row))}
              >
                {t('versions.removeLine')}
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            nextId.current += 1;
            setRows((current) => [...current, nextId.current]);
          }}
        >
          {t('versions.addLine')}
        </Button>
      </div>
    </fieldset>
  );
}
