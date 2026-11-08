'use client';

import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listCapturesAction } from '../actions';
import { locationLabel } from '../domain/filters';
import {
  INFRA_CAPTURE_ROLES,
  INFRA_ROLE_LABELS,
  INFRA_TYPES,
  INFRA_TYPE_LABELS,
  type InfraCaptureDto,
  type InfraCaptureRole,
  type InfraLocationOption,
  type InfraPermissions,
  type InfraType,
  type InfraViewer,
} from '../domain/types';
import { InfraCaptureDialog, type LocateSlot } from './infra-capture-dialog';
import { evidenceFileUrl, formatDateTime } from './infra-client';
import { InfraLocationSelect } from './infra-location-select';
import { InfraVideoThumb } from './infra-video-player';
import { isVideoMime, parseVideoDurationMs } from '../domain/video';
import { INFRA_TEXT } from './texts';

interface Filters {
  media: '' | 'photo' | 'video';
  text: string;
  locationId: string | null;
  levelId: string | null;
  room: string;
  wall: string;
  infraType: InfraType | '';
  role: InfraCaptureRole | '';
  from: string;
  to: string;
  mineOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  media: '',
  text: '',
  locationId: null,
  levelId: null,
  room: '',
  wall: '',
  infraType: '',
  role: '',
  from: '',
  to: '',
  mineOnly: false,
};

const inputClass =
  'min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-3 text-sm';

export function InfraGallery({
  viewer,
  projectId,
  organizationId,
  locations,
  permissions,
  suggestions,
  refreshKey,
  initialLocationId,
  onLocationChange,
  onSelectForLocate,
  onUseVideoFrame,
  allowCloudLink,
}: {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly locations: readonly InfraLocationOption[];
  readonly permissions: InfraPermissions;
  readonly suggestions: { readonly rooms: readonly string[]; readonly walls: readonly string[] };
  /** Bumped by the workspace when uploads finish so the list reloads. */
  readonly refreshKey: number;
  readonly initialLocationId?: string | null;
  /** Reports the location filter so the other infrastructure screens can start on the same location. */
  readonly onLocationChange?: (locationId: string | null) => void;
  readonly onSelectForLocate: (capture: InfraCaptureDto, slot: LocateSlot) => void;
  readonly onUseVideoFrame: (frame: File, slot: LocateSlot, capture: InfraCaptureDto) => void;
  readonly allowCloudLink: boolean;
}) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, locationId: initialLocationId ?? null });
  const [debouncedText, setDebouncedText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<InfraCaptureDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<InfraCaptureDto | null>(null);
  const requestId = useRef(0);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(filters.text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.text]);

  const load = useCallback(
    async (after: string | null) => {
      const current = ++requestId.current;
      setLoading(true);
      setError(null);
      const result = await listCapturesAction(viewer, {
        projectId,
        organizationId,
        locationId: filters.locationId,
        levelId: filters.levelId,
        text: debouncedText || null,
        room: filters.room.trim() || null,
        wall: filters.wall.trim() || null,
        infraType: filters.infraType || null,
        role: filters.role || null,
        from: filters.from || null,
        to: filters.to || null,
        mineOnly: filters.mineOnly,
        media: filters.media || null,
        taskId: null,
        cursor: after,
      });
      if (current !== requestId.current) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((previous) => (after ? [...previous, ...result.data.items] : [...result.data.items]));
      setCursor(result.data.nextCursor);
    },
    [viewer, projectId, organizationId, filters, debouncedText],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load(null);
  }, [load, refreshKey, localRefresh]);

  const levelOptions = useMemo(() => {
    const levelTypes = new Set(['floor', 'basement', 'roof', 'parking']);
    return locations
      .filter((node) => levelTypes.has(node.type) && !node.archived)
      .map((node) => ({ id: node.id, label: locationLabel(locations, node.id) ?? node.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'he', { numeric: true }));
  }, [locations]);

  const patch = (next: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...next }));
    // The chosen location is remembered across the infrastructure screens (capture, gallery, locating).
    if ('locationId' in next) onLocationChange?.(next.locationId ?? null);
  };
  const filtered =
    filters.locationId !== null ||
    filters.levelId !== null ||
    filters.text !== '' ||
    filters.room !== '' ||
    filters.wall !== '' ||
    filters.infraType !== '' ||
    filters.role !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.media !== '' ||
    filters.mineOnly;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="infra-gallery">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="relative flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
          <span className="sr-only">{INFRA_TEXT.gallery.search}</span>
          <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-[var(--pf-text-muted)]" aria-hidden />
          <input
            type="search"
            className={`${inputClass} ps-9`}
            placeholder={INFRA_TEXT.gallery.search}
            value={filters.text}
            onChange={(event) => patch({ text: event.target.value })}
            data-testid="infra-gallery-search"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
          data-testid="infra-gallery-filter-toggle"
        >
          <SlidersHorizontal aria-hidden />
          {INFRA_TEXT.gallery.filters}
        </Button>
        {filtered ? (
          <Button type="button" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            {INFRA_TEXT.gallery.clear}
          </Button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="grid min-w-0 gap-3 rounded-lg border border-[var(--pf-border-default)] p-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="infra-gallery-filters">
          <InfraLocationSelect
            locations={locations}
            value={filters.locationId}
            onChange={(locationId) => patch({ locationId })}
            label={INFRA_TEXT.gallery.location}
            placeholder={INFRA_TEXT.gallery.allLocations}
            emptyLabel={INFRA_TEXT.gallery.allLocations}
            testId="infra-filter-location"
          />
          {levelOptions.length > 0 ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-medium">{INFRA_TEXT.gallery.level}</span>
              <select
                className={inputClass}
                value={filters.levelId ?? ''}
                onChange={(event) => patch({ levelId: event.target.value || null })}
                data-testid="infra-filter-level"
              >
                <option value="">{INFRA_TEXT.gallery.allLevels}</option>
                {levelOptions.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">{INFRA_TEXT.gallery.room}</span>
            <input className={inputClass} list="infra-filter-rooms" value={filters.room} onChange={(event) => patch({ room: event.target.value })} />
            <datalist id="infra-filter-rooms">
              {suggestions.rooms.map((room) => (
                <option key={room} value={room} />
              ))}
            </datalist>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">{INFRA_TEXT.gallery.wall}</span>
            <input className={inputClass} list="infra-filter-walls" value={filters.wall} onChange={(event) => patch({ wall: event.target.value })} />
            <datalist id="infra-filter-walls">
              {suggestions.walls.map((wall) => (
                <option key={wall} value={wall} />
              ))}
            </datalist>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">{INFRA_TEXT.gallery.infraType}</span>
            <select
              className={inputClass}
              value={filters.infraType}
              onChange={(event) => patch({ infraType: event.target.value as InfraType | '' })}
              data-testid="infra-filter-type"
            >
              <option value="">{INFRA_TEXT.gallery.allTypes}</option>
              {INFRA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INFRA_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">{INFRA_TEXT.gallery.role}</span>
            <select className={inputClass} value={filters.role} onChange={(event) => patch({ role: event.target.value as InfraCaptureRole | '' })}>
              <option value="">{INFRA_TEXT.gallery.allRoles}</option>
              {INFRA_CAPTURE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {INFRA_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-medium">{INFRA_TEXT.gallery.from}</span>
              <input type="date" className={inputClass} value={filters.from} max={filters.to || undefined} onChange={(event) => patch({ from: event.target.value })} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-medium">{INFRA_TEXT.gallery.to}</span>
              <input type="date" className={inputClass} value={filters.to} min={filters.from || undefined} onChange={(event) => patch({ to: event.target.value })} />
            </label>
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">{INFRA_TEXT.video.media}</span>
            <select
              className={inputClass}
              value={filters.media}
              onChange={(event) => patch({ media: event.target.value as Filters['media'] })}
              data-testid="infra-filter-media"
            >
              <option value="">{INFRA_TEXT.video.mediaAll}</option>
              <option value="photo">{INFRA_TEXT.video.mediaPhotos}</option>
              <option value="video">{INFRA_TEXT.video.mediaVideos}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" checked={filters.mineOnly} onChange={(event) => patch({ mineOnly: event.target.checked })} className="size-4" />
            {INFRA_TEXT.gallery.mineOnly}
          </label>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load(null)}>
              {INFRA_TEXT.retry}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--pf-text-secondary)]">
          {filtered ? INFRA_TEXT.gallery.empty : INFRA_TEXT.gallery.emptyProject}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="infra-gallery-grid">
          {items.map((capture) => (
            <li key={capture.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setOpen(capture)}
                className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)] text-start transition hover:shadow-md"
                data-testid="infra-gallery-item"
              >
                <div className="relative aspect-square w-full bg-[var(--pf-bg-muted)]">
                  {capture.status === 'available' && isVideoMime(capture.mimeType) ? (
                    <InfraVideoThumb
                      src={evidenceFileUrl(viewer, capture.evidenceId)}
                      durationMs={parseVideoDurationMs(capture.fileName)}
                      label={capture.description ?? capture.fileName}
                    />
                  ) : capture.status === 'available' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={evidenceFileUrl(viewer, capture.latestAnnotatedEvidenceId ?? capture.evidenceId)}
                      alt={capture.description ?? capture.fileName}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-[var(--pf-text-secondary)]">
                      {INFRA_TEXT.gallery.pending}
                    </span>
                  )}
                  {capture.latestAnnotatedEvidenceId ? (
                    <span className="absolute start-1 top-1 rounded bg-(--pf-lit-black)/65 px-1.5 py-0.5 text-[10px] text-(--pf-lit-white)">
                      {INFRA_TEXT.gallery.marked}
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 p-2">
                  <span className="truncate text-xs font-medium">{locationLabel(locations, capture.locationId) ?? ''}</span>
                  <span className="truncate text-xs text-[var(--pf-text-secondary)]">
                    {[capture.room, capture.wall, capture.infraType ? INFRA_TYPE_LABELS[capture.infraType] : null].filter(Boolean).join(' · ')}
                  </span>
                  <span className="truncate text-[11px] text-[var(--pf-text-muted)]">{formatDateTime(capture.capturedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-3" role="status" aria-label={INFRA_TEXT.loading}>
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      ) : null}

      {cursor && !loading ? (
        <Button type="button" variant="secondary" onClick={() => void load(cursor)} className="mx-auto" data-testid="infra-gallery-more">
          {INFRA_TEXT.gallery.loadMore}
        </Button>
      ) : null}

      {open ? (
        <InfraCaptureDialog
          capture={open}
          viewer={viewer}
          organizationId={organizationId}
          locations={locations}
          permissions={permissions}
          suggestions={suggestions}
          allowCloudLink={allowCloudLink}
          onClose={() => setOpen(null)}
          onChanged={() => setLocalRefresh((value) => value + 1)}
          onSelectForLocate={(capture, slot) => {
            setOpen(null);
            onSelectForLocate(capture, slot);
          }}
          onUseVideoFrame={(frame, slot, capture) => {
            setOpen(null);
            onUseVideoFrame(frame, slot, capture);
          }}
        />
      ) : null}
    </div>
  );
}
