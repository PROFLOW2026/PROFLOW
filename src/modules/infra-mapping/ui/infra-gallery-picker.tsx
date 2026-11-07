'use client';

import { Images, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listCapturesAction } from '../actions';
import { locationLabel } from '../domain/filters';
import type { InfraCaptureDto, InfraLocationOption, InfraViewer } from '../domain/types';
import { evidenceFileUrl, formatDateTime } from './infra-client';
import { InfraLocationSelect } from './infra-location-select';
import { INFRA_TEXT } from './texts';

/** Picks an already catalogued photo from the project's infrastructure gallery (for locating). */
export function InfraGalleryPicker({
  viewer,
  projectId,
  organizationId,
  locations,
  defaultLocationId,
  onLocationChange,
  onPick,
  disabled,
}: {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly locations: readonly InfraLocationOption[];
  readonly defaultLocationId: string | null;
  /** Reports a location chosen in the dialog so the other screens follow it. */
  readonly onLocationChange?: (locationId: string | null) => void;
  readonly onPick: (photo: { file: File; captureId: string }) => void;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(defaultLocationId);
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<InfraCaptureDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when filters change
    setLoading(true);
    setError(null);
    listCapturesAction(viewer, { projectId, organizationId, locationId, text: debounced || null, limit: 30, media: 'photo' }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.data.items.filter((item) => item.status === 'available'));
      setCursor(result.data.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [open, viewer, projectId, organizationId, locationId, debounced]);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    const result = await listCapturesAction(viewer, { projectId, organizationId, locationId, text: debounced || null, limit: 30, media: 'photo', cursor });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((previous) => [...previous, ...result.data.items.filter((item) => item.status === 'available')]);
    setCursor(result.data.nextCursor);
  }

  async function pick(capture: InfraCaptureDto) {
    setPicking(capture.id);
    setError(null);
    try {
      const response = await fetch(evidenceFileUrl(viewer, capture.evidenceId), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      const file = new File([blob], capture.fileName, { type: blob.type || capture.mimeType });
      setOpen(false);
      onPick({ file, captureId: capture.id });
    } catch {
      setError(INFRA_TEXT.locate.reopenFailed);
    } finally {
      setPicking(null);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)} data-testid="infra-pick-gallery">
        <Images aria-hidden />
        {INFRA_TEXT.locate.gallery}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl" data-testid="infra-gallery-picker">
          <DialogHeader>
            <DialogTitle>{INFRA_TEXT.locate.galleryTitle}</DialogTitle>
            <DialogDescription>{INFRA_TEXT.gallery.search}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <InfraLocationSelect
              locations={locations}
              value={locationId}
              onChange={(next) => {
                setLocationId(next);
                onLocationChange?.(next);
              }}
              label={INFRA_TEXT.gallery.location}
              placeholder={INFRA_TEXT.gallery.allLocations}
              emptyLabel={INFRA_TEXT.gallery.allLocations}
            />
            <label className="relative flex flex-col gap-1 text-sm">
              <span className="sr-only">{INFRA_TEXT.gallery.search}</span>
              <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-[var(--pf-text-muted)]" aria-hidden />
              <input
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={INFRA_TEXT.gallery.search}
                className="min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] ps-9 pe-3 text-sm"
              />
            </label>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {!loading && items.length === 0 && !error ? (
              <p className="py-4 text-center text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.gallery.empty}</p>
            ) : null}
            <ul className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((capture) => (
                <li key={capture.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => void pick(capture)}
                    disabled={picking !== null}
                    className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-md border border-[var(--pf-border-default)] text-start disabled:opacity-60"
                    data-testid="infra-gallery-picker-item"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={evidenceFileUrl(viewer, capture.evidenceId)}
                      alt={capture.description ?? capture.fileName}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    <span className="truncate px-1 pt-0.5 text-[11px]">{locationLabel(locations, capture.locationId)}</span>
                    <span className="truncate px-1 pb-0.5 text-[10px] text-[var(--pf-text-muted)]">{formatDateTime(capture.capturedAt)}</span>
                    {picking === capture.id ? <Loader2 className="absolute start-1/2 top-1/2 size-5 -translate-x-1/2 animate-spin" aria-hidden /> : null}
                  </button>
                </li>
              ))}
            </ul>
            {loading ? (
              <div className="flex justify-center py-2" role="status">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            ) : null}
            {cursor && !loading ? (
              <Button type="button" variant="secondary" size="sm" className="mx-auto" onClick={() => void more()}>
                {INFRA_TEXT.gallery.loadMore}
              </Button>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
