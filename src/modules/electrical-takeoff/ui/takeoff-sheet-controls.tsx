'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { SheetDto, TakeoffEdit } from '../domain/contracts';

export function TakeoffSheetControls({
  sheet,
  readOnly,
  onApply,
}: {
  sheet: SheetDto;
  readOnly: boolean;
  onApply: (edit: TakeoffEdit) => void;
}) {
  const t = useTranslations('takeoff');
  const [floor, setFloor] = useState(sheet.floorLabel ?? '');
  const [ratio, setRatio] = useState(sheet.scale.ratio != null ? String(sheet.scale.ratio) : '');

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-2">
      <div className="min-w-[8rem] flex-1">
        <label className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('sheet.floor')}</label>
        <input
          data-testid="takeoff-sheet-floor"
          className="mt-0.5 min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
          value={floor}
          disabled={readOnly}
          placeholder={t('sheet.floorPlaceholder')}
          onChange={(e) => setFloor(e.target.value)}
          onBlur={() => {
            if (readOnly) return;
            const next = floor.trim() || null;
            if (next !== (sheet.floorLabel ?? null)) {
              onApply({ op: 'set_floor', sheetKey: sheet.sheetKey, floorLabel: next });
            }
          }}
        />
      </div>
      <div className="min-w-[6rem] flex-1">
        <label className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('sheet.scaleRatio')}</label>
        <input
          data-testid="takeoff-sheet-scale"
          inputMode="decimal"
          className="mt-0.5 min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
          value={ratio}
          disabled={readOnly}
          placeholder="1:100"
          onChange={(e) => setRatio(e.target.value)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        data-testid="takeoff-verify-scale"
        disabled={readOnly || !ratio.trim()}
        onClick={() => {
          const parsed = Number(ratio.replace(',', '.'));
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          onApply({ op: 'set_scale', sheetKey: sheet.sheetKey, ratio: parsed });
        }}
      >
        {t('sheet.verifyScale')}
      </Button>
    </div>
  );
}