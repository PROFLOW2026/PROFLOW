'use client';

/**
 * Touch surface for the 4 reference points: a point lands exactly where the finger touches, can be dragged
 * to fix it, and a magnifier shows the exact spot above the finger while it is being placed or dragged.
 * Also: the small "source photo" reference with its 1-4 order markers.
 */

import { X } from 'lucide-react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { applyMat3, invertMat3, userAdjustMatrix, type Mat3, type Pt } from '../domain/infra-overlay-geometry';

/** A finger covers about this radius, so a pin counts as touched inside it. */
const PIN_HIT_RADIUS_PX = 28;
const LOUPE_SIZE = 104;
const LOUPE_ZOOM = 3;
const LOUPE_GAP = 22;

export interface PhotoLike {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface GestureParts {
  readonly pivot: Pt;
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
  readonly rotation: number;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/* -------------------------------------------------------------------------- */
/* Magnifiers                                                                  */
/* -------------------------------------------------------------------------- */

function LoupeFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-full border-2 border-white bg-black shadow-lg"
      style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
    >
      {children}
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/80" aria-hidden />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-300/80" aria-hidden />
      <span
        className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/70"
        aria-hidden
      />
    </div>
  );
}

/** Magnified view of a picture (any transform from picture pixels to the touch surface), centred on `center`. */
export function ImageLoupe({
  photo,
  toSurface,
  center,
}: {
  readonly photo: PhotoLike;
  /** Picture pixels -> touch-surface pixels. */
  readonly toSurface: Mat3;
  /** Surface pixels. */
  readonly center: Pt;
}) {
  const q = applyMat3(invertMat3(toSurface), center);
  const s = Math.hypot(toSurface[0], toSurface[3]) * LOUPE_ZOOM;
  return (
    <LoupeFrame>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${photo.url}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${photo.width * s}px ${photo.height * s}px`,
          backgroundPosition: `${LOUPE_SIZE / 2 - q.x * s}px ${LOUPE_SIZE / 2 - q.y * s}px`,
        }}
      />
    </LoupeFrame>
  );
}

/** Magnified view of the live (or frozen) camera frame, cropped like the on-screen `object-cover` video. */
export function VideoLoupe({
  videoRef,
  stageW,
  stageH,
  center,
}: {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly stageW: number;
  readonly stageH: number;
  readonly center: Pt;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth || !video.videoHeight) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cover = Math.max(stageW / video.videoWidth, stageH / video.videoHeight);
    const offsetX = (stageW - video.videoWidth * cover) / 2;
    const offsetY = (stageH - video.videoHeight * cover) / 2;
    const half = LOUPE_SIZE / (2 * LOUPE_ZOOM);
    const sx = (center.x - half - offsetX) / cover;
    const sy = (center.y - half - offsetY) / cover;
    const sw = (half * 2) / cover;
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, sx, sy, sw, sw, 0, 0, canvas.width, canvas.height);
    } catch {
      // A frame that is not ready yet simply leaves the magnifier empty for a moment.
    }
  }, [videoRef, stageW, stageH, center.x, center.y]);
  return (
    <LoupeFrame>
      <canvas ref={canvasRef} width={LOUPE_SIZE * 2} height={LOUPE_SIZE * 2} className="absolute inset-0 size-full" />
    </LoupeFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Pin marks                                                                   */
/* -------------------------------------------------------------------------- */

export function PinMark({
  x,
  y,
  label,
  highlighted,
}: {
  readonly x: number;
  readonly y: number;
  readonly label: number;
  readonly highlighted?: boolean;
}) {
  const ring = highlighted ? '#fb923c' : '#22d3ee';
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x, top: y, width: 26, height: 26, transform: 'translate(-50%,-50%)' }}
    >
      <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden="true">
        <circle cx="13" cy="13" r="9" fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="4" />
        <circle cx="13" cy="13" r="9" fill="none" stroke={ring} strokeWidth="2" />
        <circle cx="13" cy="13" r="1.6" fill={ring} />
      </svg>
      <span
        className="absolute -end-1.5 -top-3.5 min-w-4 rounded bg-black/75 px-1 text-center text-[11px] font-bold leading-4 text-white"
        dir="ltr"
      >
        {label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pin surface                                                                 */
/* -------------------------------------------------------------------------- */

interface PinSurfaceProps {
  readonly width: number;
  readonly height: number;
  /** Normalised (0..1) pin positions. */
  readonly pins: readonly Pt[];
  readonly maxPins: number;
  readonly onPinsChange: (pins: Pt[]) => void;
  /** When set, a drag on empty space (1 finger) / pinch (2 fingers) fine-tunes the overlay. */
  readonly onAdjust?: (incremental: Mat3, parts: GestureParts) => void;
  /** Called once when such a gesture begins (lets the caller remember the previous position). */
  readonly onGestureStart?: () => void;
  readonly highlightIndex?: number;
  /** A locked surface ignores every touch (no accidental moves after the user finished aligning). */
  readonly locked?: boolean;
  /** Magnifier content for the point being placed / dragged (`center` in surface pixels). */
  readonly renderLoupe?: (center: Pt) => ReactNode;
  readonly children?: ReactNode;
}

type PointerMode = 'none' | 'pin' | 'gesture';

function loupePosition(center: Pt, width: number, height: number): { left: number; top: number } {
  const half = LOUPE_SIZE / 2;
  const left = Math.min(width - half - 4, Math.max(half + 4, center.x));
  const above = center.y - LOUPE_GAP - half;
  const top = above >= half + 4 ? above : Math.min(height - half - 4, center.y + LOUPE_GAP + half);
  return { left, top };
}

export function PinSurface({
  width,
  height,
  pins,
  maxPins,
  onPinsChange,
  onAdjust,
  onGestureStart,
  highlightIndex,
  locked,
  renderLoupe,
  children,
}: PinSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ width, height, pins, maxPins, onPinsChange, onAdjust, onGestureStart, locked });
  useLayoutEffect(() => {
    latest.current = { width, height, pins, maxPins, onPinsChange, onAdjust, onGestureStart, locked };
  });
  const pointers = useRef(new Map<number, Pt>());
  const mode = useRef<PointerMode>('none');
  const activeIndex = useRef(-1);
  const primaryId = useRef(-1);
  const grab = useRef<Pt>({ x: 0, y: 0 });
  const [loupeAt, setLoupeAt] = useState<Pt | null>(null);

  function local(e: ReactPointerEvent): Pt {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const { width: w, height: h, pins: current, maxPins: max, onAdjust: adjust, locked: isLocked } = latest.current;
    if (isLocked || w <= 0 || h <= 0) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    ref.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size !== 1) return; // second finger: only meaningful for gestures
    primaryId.current = e.pointerId;

    let hit = -1;
    let best = PIN_HIT_RADIUS_PX;
    current.forEach((q, i) => {
      const d = Math.hypot(q.x * w - p.x, q.y * h - p.y);
      if (d < best) {
        best = d;
        hit = i;
      }
    });
    if (hit >= 0) {
      mode.current = 'pin';
      activeIndex.current = hit;
      // The pin keeps its distance from the finger, so touching it never makes it jump.
      grab.current = { x: current[hit]!.x * w - p.x, y: current[hit]!.y * h - p.y };
      setLoupeAt({ x: current[hit]!.x * w, y: current[hit]!.y * h });
      return;
    }
    if (current.length < max) {
      // A new point lands exactly where the finger touches.
      grab.current = { x: 0, y: 0 };
      activeIndex.current = current.length;
      mode.current = 'pin';
      latest.current.onPinsChange([...current, { x: clamp01(p.x / w), y: clamp01(p.y / h) }]);
      setLoupeAt({ x: clamp01(p.x / w) * w, y: clamp01(p.y / h) * h });
      return;
    }
    mode.current = adjust ? 'gesture' : 'none';
    if (adjust) latest.current.onGestureStart?.();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = new Map(pointers.current);
    if (!prev.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const { width: w, height: h, pins: current, onPinsChange: change, onAdjust: adjust } = latest.current;

    if (mode.current === 'pin') {
      if (e.pointerId !== primaryId.current) return;
      const i = activeIndex.current;
      if (i < 0 || i >= current.length) return;
      const next = current.slice();
      next[i] = {
        x: clamp01((p.x + grab.current.x) / w),
        y: clamp01((p.y + grab.current.y) / h),
      };
      change(next);
      setLoupeAt({ x: next[i]!.x * w, y: next[i]!.y * h });
      return;
    }

    if (mode.current === 'gesture' && adjust) {
      const ids = [...pointers.current.keys()];
      if (ids.length === 1) {
        const before = prev.get(e.pointerId)!;
        const parts: GestureParts = {
          pivot: { x: 0, y: 0 },
          tx: p.x - before.x,
          ty: p.y - before.y,
          scale: 1,
          rotation: 0,
        };
        adjust(userAdjustMatrix(parts.pivot, parts), parts);
      } else if (ids.length >= 2) {
        const [a, b] = ids as [number, number];
        const p0 = prev.get(a)!;
        const p1 = prev.get(b)!;
        const c0 = pointers.current.get(a)!;
        const c1 = pointers.current.get(b)!;
        const d0 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const d1 = Math.hypot(c1.x - c0.x, c1.y - c0.y);
        if (d0 < 8) return;
        const scale = d1 / d0;
        const rotation = Math.atan2(c1.y - c0.y, c1.x - c0.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const midPrev = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const midCur = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 };
        const parts: GestureParts = {
          pivot: midPrev,
          tx: midCur.x - midPrev.x,
          ty: midCur.y - midPrev.y,
          scale,
          rotation,
        };
        adjust(userAdjustMatrix(parts.pivot, parts), parts);
      }
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      mode.current = 'none';
      activeIndex.current = -1;
      primaryId.current = -1;
      setLoupeAt(null);
    }
  }

  const loupe = loupeAt && renderLoupe ? loupePosition(loupeAt, width, height) : null;

  return (
    <div
      ref={ref}
      className="relative select-none overflow-hidden"
      style={{ width, height, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {children}
      {pins.map((pin, i) => (
        <PinMark key={i} x={pin.x * width} y={pin.y * height} label={i + 1} highlighted={i === highlightIndex} />
      ))}
      {loupe && loupeAt && renderLoupe ? (
        <div
          className="pointer-events-none absolute"
          style={{ left: loupe.left, top: loupe.top, transform: 'translate(-50%,-50%)' }}
          data-testid="infra-pin-loupe"
          aria-hidden="true"
        >
          {renderLoupe(loupeAt)}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Source photo reference with the 1-4 order                                    */
/* -------------------------------------------------------------------------- */

type ThumbSize = 'small' | 'large' | 'hidden';

const THUMB_WIDTH: Record<'small' | 'large', number> = { small: 92, large: 188 };

/**
 * The "before" photo with numbered points, kept small and see-through so the wall stays visible. Tap to
 * enlarge / shrink, use the corner button to tuck it away; the next point to mark pulses in orange.
 */
export function ReferenceThumb({
  photo,
  pins,
  nextIndex,
  label,
}: {
  readonly photo: PhotoLike;
  readonly pins: readonly Pt[];
  /** Index of the point to mark next (orange); -1 when nothing is pending. */
  readonly nextIndex: number;
  readonly label: string;
}) {
  const [size, setSize] = useState<ThumbSize>('small');
  const wrapperClass = 'absolute start-2 top-[max(0.5rem,env(safe-area-inset-top))] z-10';
  const stop = (e: ReactPointerEvent) => e.stopPropagation();

  if (size === 'hidden') {
    return (
      <button
        type="button"
        className={`${wrapperClass} inline-flex min-h-9 items-center gap-1 rounded-full bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur`}
        onClick={() => setSize('small')}
        onPointerDown={stop}
        aria-label={label}
        data-testid="infra-reference-show"
        dir="rtl"
      >
        {nextIndex >= 0 ? `${nextIndex + 1}/${pins.length || 4}` : label}
      </button>
    );
  }

  const width = THUMB_WIDTH[size];
  return (
    <div className={wrapperClass} onPointerDown={stop} data-testid="infra-reference-thumb" dir="rtl">
      <div
        className="relative overflow-hidden rounded-md border border-white/50 bg-black/50 opacity-90 shadow"
        style={{ width }}
      >
        <button
          type="button"
          className="relative block w-full"
          onClick={() => setSize((s) => (s === 'small' ? 'large' : 'small'))}
          aria-label={label}
          style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="absolute inset-0 size-full" draggable={false} />
          {pins.map((p, i) => {
            const next = i === nextIndex;
            return (
              <span
                key={i}
                className={`absolute flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-bold leading-none text-black ${
                  next ? 'animate-pulse border-black bg-orange-400' : 'border-black/70 bg-cyan-300'
                }`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                dir="ltr"
              >
                {i + 1}
              </span>
            );
          })}
        </button>
        <button
          type="button"
          className="absolute end-0.5 top-0.5 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
          onClick={() => setSize('hidden')}
          aria-label={label}
          data-testid="infra-reference-hide"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {nextIndex >= 0 ? (
        <div className="mt-0.5 rounded bg-black/60 px-1.5 text-center text-[11px] leading-4 text-white">{label}</div>
      ) : null}
    </div>
  );
}
