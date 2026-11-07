'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listCapturesAction } from '../actions';
import { locationLabel } from '../domain/filters';
import type { InfraCaptureDto, InfraLocationOption, InfraViewer } from '../domain/types';
import { evidenceFileUrl, formatDateTime } from './infra-client';
import { INFRA_TEXT } from './texts';

const RECENT_COUNT = 4;

/**
 * The latest photos of the chosen location as one-tap choices for the "before" photo. It reuses the existing
 * gallery listing; choosing a photo only reads it - nothing is uploaded or saved.
 */
export function InfraRecentPhotos({
  viewer,
  projectId,
  organizationId,
  locations,
  locationId,
  onPick,
}: {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly locations: readonly InfraLocationOption[];
  readonly locationId: string | null;
  readonly onPick: (photo: { file: File; captureId: string }) => void;
}) {
  const [items, setItems] = useState<InfraCaptureDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the location changes
    setLoading(true);
    listCapturesAction(viewer, {
      projectId,
      organizationId,
      locationId,
      text: null,
      limit: RECENT_COUNT * 2,
      media: 'photo',
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setItems(result.data.items.filter((item) => item.status === 'available').slice(0, RECENT_COUNT));
    });
    return () => {
      cancelled = true;
    };
  }, [viewer, projectId, organizationId, locationId]);

  async function pick(capture: InfraCaptureDto) {
    setPicking(capture.id);
    setError(null);
    try {
      const response = await fetch(evidenceFileUrl(viewer, capture.evidenceId), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      onPick({ file: new File([blob], capture.fileName, { type: blob.type || capture.mimeType }), captureId: capture.id });
    } catch {
      setError(INFRA_TEXT.locate.reopenFailed);
    } finally {
      setPicking(null);
    }
  }

  if (!loading && items.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-1.5" aria-label={INFRA_TEXT.locate.recent} data-testid="infra-recent-photos">
      <h4 className="text-xs font-medium text-[var(--pf-text-secondary)]">
        {locationId ? INFRA_TEXT.locate.recent : INFRA_TEXT.locate.recentProject}
      </h4>
      {loading ? (
        <div className="flex py-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : (
        <ul className="grid min-w-0 grid-cols-4 gap-2">
          {items.map((capture) => (
            <li key={capture.id} className="min-w-0">
              <button
                type="button"
                onClick={() => void pick(capture)}
                disabled={picking !== null}
                className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-md border border-[var(--pf-border-default)] text-start disabled:opacity-60"
                data-testid="infra-recent-photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={evidenceFileUrl(viewer, capture.evidenceId)}
                  alt={capture.description ?? capture.fileName}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <span className="truncate px-1 text-[10px] text-[var(--pf-text-muted)]">
                  {locationId ? formatDateTime(capture.capturedAt) : (locationLabel(locations, capture.locationId) ?? '')}
                </span>
                {picking === capture.id ? (
                  <Loader2 className="absolute start-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-spin" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <span className="text-xs text-[var(--pf-status-danger-fg)]" role="alert">
          {error}
        </span>
      ) : null}
    </section>
  );
}
