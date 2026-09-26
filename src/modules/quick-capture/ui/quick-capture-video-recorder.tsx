'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import { MAX_DOCUMENT_SIZE_BYTES } from '@/modules/documents/domain/file-rules';
import {
  isOptimizedRecordingSupported,
  recordFieldVideo,
  type RecordFieldVideoResult,
} from '../client/record-field-video';

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function QuickCaptureVideoRecorder({
  onRecorded,
  onFallback,
  onCancel,
  disabled = false,
}: {
  readonly onRecorded: (file: File) => void;
  readonly onFallback: () => void;
  readonly onCancel: () => void;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('quickCapture.video');
  const tFileSize = useTranslations('documents.fileSize');
  const sessionRef = useRef<RecordFieldVideoResult | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [approachingLimit, setApproachingLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!isOptimizedRecordingSupported()) {
        if (!cancelled) onFallback();
        return;
      }

      try {
        const session = await recordFieldVideo({
          onDurationMs: (ms) => {
            if (!cancelled) setDurationMs(ms);
          },
          onSizeBytes: (bytes) => {
            if (!cancelled) setSizeBytes(bytes);
          },
          onApproachingLimit: () => {
            if (!cancelled) setApproachingLimit(true);
          },
        });
        if (cancelled) {
          if (session.kind === 'recording') session.cancel();
          return;
        }
        if (session.kind === 'fallback') {
          onFallback();
          return;
        }
        sessionRef.current = session;
        setStarting(false);
      } catch {
        if (!cancelled) onFallback();
      }
    })();

    return () => {
      cancelled = true;
      const session = sessionRef.current;
      if (session?.kind === 'recording') session.cancel();
    };
  }, [onFallback]);

  const handleStop = async () => {
    const session = sessionRef.current;
    if (!session || session.kind !== 'recording') return;
    setStopping(true);
    setError(null);
    try {
      const result = await session.stop();
      if (result.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
        setError(t('tooLarge'));
        setStopping(false);
        return;
      }
      const extension =
        result.mimeType.includes('mp4') || result.mimeType.includes('quicktime')
          ? 'mp4'
          : 'webm';
      onRecorded(
        new File([result.blob], `field-video-${Date.now()}.${extension}`, {
          type: result.mimeType,
        }),
      );
    } catch {
      setError(t('uploadFailed'));
      setStopping(false);
    }
  };

  const handleCancel = () => {
    const session = sessionRef.current;
    if (session?.kind === 'recording') session.cancel();
    onCancel();
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">{t('recording')}</p>
      <p className="text-2xl tabular-nums">{formatDuration(durationMs)}</p>
      {sizeBytes > 0 ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {formatFileSize(sizeBytes, tFileSize)} / {formatFileSize(MAX_DOCUMENT_SIZE_BYTES, tFileSize)}
        </p>
      ) : null}
      {approachingLimit ? (
        <Alert tone="warning" role="status">
          {t('approachingLimit')}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={disabled || starting || stopping}
          onClick={() => void handleStop()}
        >
          {t('stop')}
        </Button>
        <Button type="button" variant="ghost" disabled={disabled || stopping} onClick={handleCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
