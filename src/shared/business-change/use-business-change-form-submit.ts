'use client';

import { useCallback, useState, type FormEvent } from 'react';
import type {
  BusinessChangeFieldDiff,
  BusinessChangeImpactLine,
} from '@/shared/business-change/types';
import type { DuplicateRecordWarningItem } from '@/components/patterns/duplicate-record-warning-dialog';

export interface UseBusinessChangeFormSubmitOptions {
  readonly enabled: boolean;
  readonly formId: string;
  readonly buildChanges: () => readonly BusinessChangeFieldDiff[];
  readonly buildImpacts?: () => readonly BusinessChangeImpactLine[];
  readonly findSimilar?: () => Promise<readonly DuplicateRecordWarningItem[]>;
  /** When true, intercept submit even if buildChanges is empty (ack still required server-side). */
  readonly alwaysConfirm?: boolean;
}

export function useBusinessChangeFormSubmit({
  enabled,
  formId,
  buildChanges,
  buildImpacts,
  findSimilar,
  alwaysConfirm = false,
}: UseBusinessChangeFormSubmitOptions) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<readonly DuplicateRecordWarningItem[]>([]);

  const changes = buildChanges();
  const impacts = buildImpacts?.() ?? [];
  const hasChanges = changes.length > 0;

  const submitConfirmed = useCallback(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const ack = form.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    setConfirmOpen(false);
    form.requestSubmit();
  }, [formId]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!enabled || (!alwaysConfirm && !hasChanges)) return;
      event.preventDefault();
      setSimilarLoading(true);
      void (async () => {
        try {
          if (findSimilar) {
            const matches = await findSimilar();
            setSimilarMatches(matches);
            if (matches.length > 0) {
              setDuplicateOpen(true);
              return;
            }
          }
          setConfirmOpen(true);
        } finally {
          setSimilarLoading(false);
        }
      })();
    },
    [alwaysConfirm, enabled, findSimilar, hasChanges],
  );

  return {
    confirmOpen,
    setConfirmOpen,
    duplicateOpen,
    setDuplicateOpen,
    similarLoading,
    similarMatches,
    changes,
    impacts,
    hasChanges,
    handleFormSubmit,
    submitConfirmed,
    continuePastDuplicate: () => setConfirmOpen(true),
  };
}
