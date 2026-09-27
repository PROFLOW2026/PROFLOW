'use client';

/**
 * Manager panel: list pending attendance correction requests and approve/reject (0137).
 *
 * Business rules:
 * - Manager sees all PENDING correction requests for the org.
 * - Approve → attendance correction is applied server-side (events replaced).
 * - Reject → request is closed; attendance unchanged; employee sees the note.
 */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AttendanceCorrectionRequestRecord } from '../data/attendance-corrections.repository';

function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTime(date: Date | null, timeZone: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('he', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export interface CorrectionRequestActionResult {
  readonly error?: string;
}

export interface AttendanceCorrectionRequestsPanelProps {
  readonly requests: readonly AttendanceCorrectionRequestRecord[];
  readonly employeeNames: ReadonlyMap<string, string>;
  readonly timeZone: string;
  readonly onApprove: (requestId: string, reviewerNote: string | null) => Promise<CorrectionRequestActionResult>;
  readonly onReject: (requestId: string, reviewerNote: string) => Promise<CorrectionRequestActionResult>;
}

interface ReviewState {
  readonly requestId: string;
  readonly mode: 'approve' | 'reject';
  readonly note: string;
  readonly pending: boolean;
  readonly error: string | null;
}

export function AttendanceCorrectionRequestsPanel({
  requests,
  employeeNames,
  timeZone,
  onApprove,
  onReject,
}: AttendanceCorrectionRequestsPanelProps) {
  const t = useTranslations('workforce.attendanceCorrectionRequests');
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const pending = requests.filter(
    (req) => req.status === 'pending' && !resolvedIds.has(req.id),
  );

  async function handleConfirm() {
    if (!reviewState) return;
    setReviewState((prev) => prev && { ...prev, pending: true });

    const result =
      reviewState.mode === 'approve'
        ? await onApprove(reviewState.requestId, reviewState.note || null)
        : await onReject(reviewState.requestId, reviewState.note);

    if (result.error) {
      setReviewState((prev) => prev && { ...prev, pending: false, error: result.error ?? null });
    } else {
      setResolvedIds((prev) => new Set([...prev, reviewState.requestId]));
      setReviewState(null);
    }
  }

  if (pending.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--pf-border)] px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((req) => {
        const isActive = reviewState?.requestId === req.id;
        const empName = employeeNames.get(req.employeeId) ?? req.employeeId;

        return (
          <div
            key={req.id}
            className="rounded-lg border border-[var(--pf-border)] p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-medium">{empName}</p>
                <p className="text-[var(--pf-text-secondary)]">
                  {formatDate(req.workDate)}
                </p>
              </div>
              <Badge tone="neutral">{t('statusPending')}</Badge>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--pf-text-secondary)]">
              <div>
                <dt className="inline">{t('requestedClockIn')}: </dt>
                <dd className="inline text-[var(--pf-text-primary)]">
                  {formatTime(req.requestedClockIn, timeZone)}
                </dd>
              </div>
              <div>
                <dt className="inline">{t('requestedClockOut')}: </dt>
                <dd className="inline text-[var(--pf-text-primary)]">
                  {formatTime(req.requestedClockOut, timeZone)}
                </dd>
              </div>
              <div className="col-span-2 mt-1">
                <dt className="inline">{t('reason')}: </dt>
                <dd className="inline text-[var(--pf-text-primary)]">{req.reason}</dd>
              </div>
            </dl>

            {/* Inline approve/reject flow */}
            {!isActive && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    setReviewState({
                      requestId: req.id,
                      mode: 'approve',
                      note: '',
                      pending: false,
                      error: null,
                    })
                  }
                >
                  {t('approve')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setReviewState({
                      requestId: req.id,
                      mode: 'reject',
                      note: '',
                      pending: false,
                      error: null,
                    })
                  }
                >
                  {t('reject')}
                </Button>
              </div>
            )}

            {isActive && reviewState && (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  placeholder={
                    reviewState.mode === 'reject'
                      ? t('rejectionNotePlaceholder')
                      : t('approvalNotePlaceholder')
                  }
                  value={reviewState.note}
                  onChange={(e) =>
                    setReviewState((prev) => prev && { ...prev, note: e.target.value })
                  }
                  rows={2}
                  maxLength={2000}
                  disabled={reviewState.pending}
                />
                {reviewState.error && (
                  <p className="text-xs text-[var(--pf-status-error-fg)]">{reviewState.error}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={reviewState.mode === 'approve' ? 'primary' : 'danger'}
                    onClick={handleConfirm}
                    disabled={reviewState.pending || (reviewState.mode === 'reject' && !reviewState.note.trim())}
                  >
                    {reviewState.pending
                      ? t('processing')
                      : reviewState.mode === 'approve'
                        ? t('confirmApprove')
                        : t('confirmReject')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReviewState(null)}
                    disabled={reviewState.pending}
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
