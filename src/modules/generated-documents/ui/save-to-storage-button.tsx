'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ReportKind } from '@/modules/reports';
import { saveGeneratedReportToStorageAction } from '../application/actions';
import type { GeneratedArtifactSummary } from '../domain/types';

export function SaveToStorageButton({
  kind,
  entityId,
  reportMonth,
  compact = false,
  onSaved,
}: {
  readonly kind: ReportKind;
  readonly entityId: string;
  readonly reportMonth?: string;
  readonly compact?: boolean;
  readonly onSaved?: () => void;
}) {
  const t = useTranslations('generatedDocuments');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const duplicateRef = useRef<GeneratedArtifactSummary | null>(null);
  const idempotencyRef = useRef<string>(crypto.randomUUID());

  const runSave = useCallback(
    (forceNewVersion: boolean) => {
      setErrorMessage(null);
      startTransition(async () => {
        const response = await saveGeneratedReportToStorageAction({
          kind,
          entityId,
          reportMonth,
          forceNewVersion,
          idempotencyKey: idempotencyRef.current,
        });
        if (response.error) {
          setErrorMessage(response.error);
          return;
        }
        if (response.result?.status === 'duplicate') {
          duplicateRef.current = response.result.existing;
          setDuplicateOpen(true);
          return;
        }
        if (response.result?.status === 'saved' || response.result?.status === 'idempotent') {
          setDuplicateOpen(false);
          onSaved?.();
          router.refresh();
        }
      });
    },
    [entityId, kind, onSaved, reportMonth, router, startTransition],
  );

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant={compact ? 'ghost' : 'secondary'}
          size="sm"
          disabled={pending}
          onClick={() => {
            idempotencyRef.current = crypto.randomUUID();
            runSave(false);
          }}
        >
          {t('saveToStorage')}
        </Button>
        {errorMessage ? (
          <Alert tone="danger" role="alert" className="max-w-sm text-xs">
            {errorMessage}
          </Alert>
        ) : null}
      </div>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('duplicate.title')}</DialogTitle>
            <DialogDescription>{t('duplicate.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-wrap gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('duplicate.cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const docId = duplicateRef.current?.documentId;
                if (docId) {
                  window.open(`/api/org-storage/download/${docId}?disposition=inline`, '_blank');
                }
              }}
            >
              {t('duplicate.openExisting')}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                idempotencyRef.current = crypto.randomUUID();
                runSave(true);
              }}
            >
              {t('duplicate.saveNewVersion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
