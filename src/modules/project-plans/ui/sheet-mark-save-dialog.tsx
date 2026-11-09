'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetMarkBoqPicker, type SheetMarkBoqLineOption } from './sheet-mark-boq-picker';

export type SheetMarkSaveDialogMode =
  | { readonly kind: 'note'; readonly x: number; readonly y: number; readonly pageIndex: number }
  | {
      readonly kind: 'measure';
      readonly pageIndex: number;
      readonly quantityLabel: string;
      readonly quantityValue: string;
    };

export function SheetMarkSaveDialog({
  open,
  mode,
  boqLines,
  initialBoqId,
  onCancel,
  onConfirm,
  busy,
}: {
  readonly open: boolean;
  readonly mode: SheetMarkSaveDialogMode | null;
  readonly boqLines: readonly SheetMarkBoqLineOption[];
  readonly initialBoqId?: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: (input: { note?: string; boqNodeId: string | null }) => void;
  readonly busy?: boolean;
}) {
  const t = useTranslations('projectPlans.sheetMarks');
  const tCommon = useTranslations('common');
  const [note, setNote] = useState('');
  const [boqNodeId, setBoqNodeId] = useState<string | null>(initialBoqId ?? null);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setBoqNodeId(initialBoqId ?? null);
  }, [open, initialBoqId]);

  if (!mode) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode.kind === 'note' ? t('noteDialogTitle') : t('measureDialogTitle')}</DialogTitle>
          <DialogDescription>
            {mode.kind === 'measure' ? t('measureDialogDescription', { quantity: mode.quantityValue }) : t('noteDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {mode.kind === 'measure' ? (
            <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm">
              <span className="text-[var(--pf-text-secondary)]">{mode.quantityLabel}: </span>
              <span className="font-semibold tabular-nums" dir="ltr">
                {mode.quantityValue}
              </span>
            </div>
          ) : (
            <Label className="flex flex-col gap-1 text-sm">
              <span>{t('noteFieldLabel')}</span>
              <Input value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
            </Label>
          )}
          <SheetMarkBoqPicker lines={boqLines} value={boqNodeId} onChange={setBoqNodeId} disabled={busy} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm({ note: mode.kind === 'note' ? note.trim() : undefined, boqNodeId })}
            disabled={busy || (mode.kind === 'note' && !note.trim())}
            loading={busy}
          >
            {t('confirmSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
