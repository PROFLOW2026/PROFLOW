'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';
import type { CaptureDocumentDetail } from '../domain/types';

export function QuickCaptureGallery({
  documents,
  selectedDocumentId,
  onSelectDocument,
  selectable = false,
  onRemoveAt,
  previewUrls,
}: {
  readonly documents: readonly CaptureDocumentDetail[];
  readonly selectedDocumentId?: string | null;
  readonly onSelectDocument?: (documentId: string) => void;
  readonly selectable?: boolean;
  readonly onRemoveAt?: (index: number) => void;
  readonly previewUrls?: readonly string[];
}) {
  const t = useTranslations('quickCapture.gallery');

  if (documents.length === 0 && !previewUrls?.length) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t('aria')}>
      {documents.map((document, index) => {
        const selected = selectable && selectedDocumentId === document.documentId;
        const previewUrl = previewUrls?.[index];
        return (
          <li key={document.documentId}>
            <div
              className={cn(
                'relative overflow-hidden rounded-md border border-[var(--pf-border-default)]',
                selected && 'ring-2 ring-[var(--pf-accent-primary)]',
              )}
            >
              {selectable ? (
                <button
                  type="button"
                  className="block w-full text-start"
                  aria-pressed={selected}
                  onClick={() => onSelectDocument?.(document.documentId)}
                >
                  <GalleryImage
                    documentId={document.documentId}
                    fileName={document.fileName}
                    previewUrl={previewUrl}
                  />
                </button>
              ) : (
                <GalleryImage
                  documentId={document.documentId}
                  fileName={document.fileName}
                  previewUrl={previewUrl}
                />
              )}
              {onRemoveAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute end-1 top-1 min-h-8 bg-[var(--pf-bg-surface)]/90 px-2"
                  aria-label={t('remove')}
                  onClick={() => onRemoveAt(index)}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
      {previewUrls?.slice(documents.length).map((previewUrl, index) => (
        <li key={`preview-${index}`}>
          <div className="relative overflow-hidden rounded-md border border-[var(--pf-border-default)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="aspect-square w-full object-cover" />
            {onRemoveAt ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute end-1 top-1 min-h-8 bg-[var(--pf-bg-surface)]/90 px-2"
                aria-label={t('remove')}
                onClick={() => onRemoveAt(documents.length + index)}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function GalleryImage({
  documentId,
  fileName,
  previewUrl,
}: {
  readonly documentId: string;
  readonly fileName: string;
  readonly previewUrl?: string;
}) {
  const src =
    previewUrl ?? `/api/org-storage/download/${documentId}?disposition=inline`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={fileName} className="aspect-square w-full object-cover" loading="lazy" />
  );
}
