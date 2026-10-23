'use client';

import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import {
  DuplicateRecordWarningDialog,
  type DuplicateRecordWarningItem,
} from '@/components/patterns/duplicate-record-warning-dialog';
import type {
  BusinessChangeFieldDiff,
  BusinessChangeImpactLine,
} from '@/shared/business-change/types';

export interface BusinessChangeFormDialogsProps {
  readonly confirmOpen: boolean;
  readonly setConfirmOpen: (open: boolean) => void;
  readonly duplicateOpen: boolean;
  readonly setDuplicateOpen: (open: boolean) => void;
  readonly pending?: boolean;
  readonly changes: readonly BusinessChangeFieldDiff[];
  readonly impacts?: readonly BusinessChangeImpactLine[];
  readonly similarMatches: readonly DuplicateRecordWarningItem[];
  readonly confirmTitle: string;
  readonly confirmDescription?: string;
  readonly duplicateTitle: string;
  readonly duplicateDescription?: string;
  readonly onConfirm: () => void;
  readonly onBackToEdit: () => void;
  readonly onContinuePastDuplicate: () => void;
}

export function BusinessChangeFormDialogs({
  confirmOpen,
  setConfirmOpen,
  duplicateOpen,
  setDuplicateOpen,
  pending = false,
  changes,
  impacts = [],
  similarMatches,
  confirmTitle,
  confirmDescription,
  duplicateTitle,
  duplicateDescription,
  onConfirm,
  onBackToEdit,
  onContinuePastDuplicate,
}: BusinessChangeFormDialogsProps) {
  return (
    <>
      <DuplicateRecordWarningDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        title={duplicateTitle}
        description={duplicateDescription}
        matches={similarMatches}
        onBackToEdit={onBackToEdit}
        onContinue={onContinuePastDuplicate}
      />
      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        changes={changes}
        impacts={impacts}
        pending={pending}
        onConfirm={onConfirm}
        onBackToEdit={onBackToEdit}
      />
    </>
  );
}
