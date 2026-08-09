'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { StatusToast, type StatusToastTone } from '@/components/ui/status-toast';
import { cn } from '@/shared/ui/cn';

export type ExportDownloadFeedback = {
  busy: boolean;
  tone: StatusToastTone;
  message: string;
  open: boolean;
  dismiss: () => void;
  run: (href: string) => Promise<void>;
};

function localizedExportUrl(locale: string, href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withSlash === `/${locale}` || withSlash.startsWith(`/${locale}/`)) return withSlash;
  return `/${locale}${withSlash}`;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return utf[1].trim().replace(/^"|"$/g, '');
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delayed revoke: immediate revoke can cancel the download in Firefox / some Chromium builds.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

/**
 * Shared export download feedback: pending → success/fail toasts, blocks duplicates.
 */
export function useExportDownload(): ExportDownloadFeedback {
  const locale = useLocale();
  const t = useTranslations('exports.feedback');
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [tone, setTone] = React.useState<StatusToastTone>('info');
  const [message, setMessage] = React.useState('');
  const busyRef = React.useRef(false);

  const dismiss = React.useCallback(() => setOpen(false), []);

  const run = React.useCallback(
    async (href: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setTone('info');
      setMessage(t('preparing'));
      setOpen(true);

      try {
        const url = localizedExportUrl(locale, href);
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/octet-stream,text/csv,application/json' },
        });

        if (!response.ok) {
          let key: 'forbidden' | 'invalid' | 'failed' = 'failed';
          if (response.status === 403) key = 'forbidden';
          else if (response.status === 400) key = 'invalid';
          try {
            const body = (await response.json()) as { error?: string };
            if (body.error === 'forbidden') key = 'forbidden';
            if (body.error === 'invalid_request') key = 'invalid';
          } catch {
            // keep mapped key
          }
          throw new Error(key);
        }

        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error('failed');
        }

        const fileName =
          filenameFromDisposition(response.headers.get('Content-Disposition')) ?? 'export.bin';
        triggerBlobDownload(blob, fileName);

        setTone('success');
        setMessage(t('ready'));
        setOpen(true);
      } catch (error) {
        const key =
          error instanceof Error &&
          (error.message === 'forbidden' ||
            error.message === 'invalid' ||
            error.message === 'failed')
            ? error.message
            : 'failed';
        setTone('danger');
        setMessage(t(key));
        setOpen(true);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [locale, t],
  );

  return { busy, tone, message, open, dismiss, run };
}

export interface ExportDownloadControlProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  href: string;
  feedback?: ExportDownloadFeedback;
  children: React.ReactNode;
}

/**
 * Client control that fetches an export blob with credentials and triggers download.
 * Shows preparing / ready / error via StatusToast. Does not fake success early.
 */
export function ExportDownloadControl({
  href,
  feedback: external,
  children,
  className,
  disabled,
  ...props
}: ExportDownloadControlProps) {
  const internal = useExportDownload();
  const feedback = external ?? internal;
  const ownsToast = !external;

  return (
    <>
      <button
        type="button"
        className={cn(className)}
        disabled={disabled || feedback.busy}
        aria-busy={feedback.busy || undefined}
        onClick={() => {
          void feedback.run(href);
        }}
        {...props}
      >
        {children}
      </button>
      {ownsToast ? (
        <StatusToast
          open={feedback.open}
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={feedback.dismiss}
        />
      ) : null}
    </>
  );
}

export function ExportDownloadToast({ feedback }: { feedback: ExportDownloadFeedback }) {
  return (
    <StatusToast
      open={feedback.open}
      tone={feedback.tone}
      message={feedback.message}
      onDismiss={feedback.dismiss}
    />
  );
}
