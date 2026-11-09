'use client';

import { useState } from 'react';
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

function SheetMarkSaveDialogForm({
  mode,
  boqLines,
  initialBoqId,
  onCancel,
  onConfirm,
  busy,
}: {
  readonly mode: SheetMarkSaveDialogMode;
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

  return (
  <>
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
  </>
  );
}

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
  if (!mode) return null;

  const formKey =
    open && mode
      ? `${mode.kind}-${mode.pageIndex}-${initialBoqId ?? ''}`
      : 'closed';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <SheetMarkSaveDialogForm
            key={formKey}
            mode={mode}
            boqLines={boqLines}
            initialBoqId={initialBoqId}
            onCancel={onCancel}
            onConfirm={onConfirm}
            busy={busy}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
