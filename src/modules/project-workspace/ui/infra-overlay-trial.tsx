'use client';

/**
 * Temporary experiment: overlay a "before the wall was closed" photo on the live camera.
 * Everything stays in the browser (nothing is uploaded or stored).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, Copy, ImageUp, RotateCcw, Rotate3d, Undo2, X } from 'lucide-react';
import {
  IDENTITY,
  computeAlignment,
  fitWithin,
  multiplyMat3,
  toCssMatrix3d,
  userAdjustMatrix,
  type Mat3,
  type Pt,
} from '../domain/infra-overlay-geometry';

const MAX_PHOTO_SIDE = 1600;
const MIN_PINS = 2;
const MAX_PINS = 4;
/** Touch placement: the pin sits above the fingertip so the finger never hides it. */
const TOUCH_PIN_OFFSET_PX = 46;
const PIN_HIT_RADIUS_PX = 34;

const TEXT = {
  title: 'זיהוי תשתיות',
  intro:
    'ניסוי: מצלמים/בוחרים תמונה מלפני סגירת הקיר, מסמנים 2–4 נקודות זיהוי, ואז מציגים אותה שקופה מעל המצלמה החיה. שום דבר לא נשמר או נשלח.',
  capture: 'צילום תמונה',
  choose: 'בחירת תמונה',
  loadError: 'לא ניתן לקרוא את התמונה',
  markHint: 'סמנו 2–4 נקודות קבועות (פינות, שקעים, מסגרות)',
  next: 'המשך',
  back: 'חזרה',
  undo: 'ביטול נקודה אחרונה',
  opacity: 'שקיפות',
  realign: 'יישור מחדש',
  perspective: 'פרספקטיבה',
  save: 'שמירת תוצאת הניסוי',
  copied: 'התוצאה הועתקה',
  close: 'סגירה',
  copy: 'העתקה',
  cameraError: 'אין גישה למצלמה',
  perspectiveRejected: 'פרספקטיבה לא סבירה – נשארה התאמה ישרה',
} as const;

interface PhotoAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

type Phase = 'idle' | 'mark' | 'live';

async function preparePhoto(file: File): Promise<PhotoAsset> {
  let source: CanvasImageSource;
  let sw: number;
  let sh: number;
  let cleanup: (() => void) | null = null;
  try {
    // 'from-image' bakes the EXIF rotation in, so the pixels match what the user saw.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    sw = bitmap.width;
    sh = bitmap.height;
    cleanup = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    source = img;
    sw = img.naturalWidth;
    sh = img.naturalHeight;
    cleanup = () => URL.revokeObjectURL(objectUrl);
  }
  const { width, height } = fitWithin(sw, sh, MAX_PHOTO_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(source, 0, 0, width, height);
  cleanup?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('encode');
  return { url: URL.createObjectURL(blob), width, height };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);
  return [ref, size] as const;
}

function subscribeNoop(): () => void {
  return () => undefined;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const barButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-40';

/* -------------------------------------------------------------------------- */
/* Pin surface: places / drags landmarks, optionally pans & pinches otherwise  */
/* -------------------------------------------------------------------------- */

interface PinSurfaceProps {
  readonly width: number;
  readonly height: number;
  /** Normalised (0..1) pin positions. */
  readonly pins: readonly Pt[];
  readonly maxPins: number;
  readonly onPinsChange: (pins: Pt[]) => void;
  /** When set, a drag on empty space (1 finger) / pinch (2 fingers) fine-tunes the overlay. */
  readonly onAdjust?: (incremental: Mat3) => void;
  readonly highlightIndex?: number;
  readonly children?: ReactNode;
}

type PointerMode = 'none' | 'pin' | 'gesture';

function PinSurface({
  width,
  height,
  pins,
  maxPins,
  onPinsChange,
  onAdjust,
  highlightIndex,
  children,
}: PinSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ width, height, pins, maxPins, onPinsChange, onAdjust });
  useLayoutEffect(() => {
    latest.current = { width, height, pins, maxPins, onPinsChange, onAdjust };
  });
  const pointers = useRef(new Map<number, Pt>());
  const mode = useRef<PointerMode>('none');
  const activeIndex = useRef(-1);
  const primaryId = useRef(-1);
  const grab = useRef<Pt>({ x: 0, y: 0 });

  function local(e: ReactPointerEvent): Pt {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const { width: w, height: h, pins: current, maxPins: max, onAdjust: adjust } = latest.current;
    if (w <= 0 || h <= 0) return;
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
      grab.current = { x: current[hit]!.x * w - p.x, y: current[hit]!.y * h - p.y };
      return;
    }
    if (current.length < max) {
      const offset = e.pointerType === 'mouse' ? 0 : TOUCH_PIN_OFFSET_PX;
      grab.current = { x: 0, y: -offset };
      activeIndex.current = current.length;
      mode.current = 'pin';
      latest.current.onPinsChange([
        ...current,
        { x: clamp01(p.x / w), y: clamp01((p.y - offset) / h) },
      ]);
      return;
    }
    mode.current = adjust ? 'gesture' : 'none';
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
      return;
    }

    if (mode.current === 'gesture' && adjust) {
      const ids = [...pointers.current.keys()];
      if (ids.length === 1) {
        const before = prev.get(e.pointerId)!;
        adjust(userAdjustMatrix({ x: 0, y: 0 }, { tx: p.x - before.x, ty: p.y - before.y, scale: 1, rotation: 0 }));
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
        adjust(
          userAdjustMatrix(midPrev, {
            tx: midCur.x - midPrev.x,
            ty: midCur.y - midPrev.y,
            scale,
            rotation,
          }),
        );
      }
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      mode.current = 'none';
      activeIndex.current = -1;
      primaryId.current = -1;
    }
  }

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
        <PinMark
          key={i}
          x={pin.x * width}
          y={pin.y * height}
          label={i + 1}
          highlighted={i === highlightIndex}
        />
      ))}
    </div>
  );
}

function PinMark({
  x,
  y,
  label,
  highlighted,
  small,
}: {
  readonly x: number;
  readonly y: number;
  readonly label: number;
  readonly highlighted?: boolean;
  readonly small?: boolean;
}) {
  const size = small ? 14 : 26;
  const ring = highlighted ? '#fb923c' : '#22d3ee';
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x, top: y, width: size, height: size, transform: 'translate(-50%,-50%)' }}
    >
      <svg viewBox="0 0 26 26" width={size} height={size} aria-hidden="true">
        <circle cx="13" cy="13" r="9" fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="4" />
        <circle cx="13" cy="13" r="9" fill="none" stroke={ring} strokeWidth="2" />
        <circle cx="13" cy="13" r="1.6" fill={ring} />
      </svg>
      {small ? null : (
        <span
          className="absolute -end-1 -top-3 rounded bg-black/70 px-1 text-[10px] font-semibold leading-4 text-white"
          dir="ltr"
        >
          {label}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1: landmarks on the photo                                              */
/* -------------------------------------------------------------------------- */

function MarkStep({
  photo,
  pins,
  onPinsChange,
  onBack,
  onNext,
}: {
  readonly photo: PhotoAsset;
  readonly pins: readonly Pt[];
  readonly onPinsChange: (pins: Pt[]) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
}) {
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const aspect = photo.width / photo.height;
  let w = area.w;
  let h = w / aspect;
  if (h > area.h) {
    h = area.h;
    w = h * aspect;
  }
  const ready = area.w > 0 && area.h > 0;
  return (
    <div className="flex h-full w-full flex-col" dir="rtl">
      <div className="flex min-h-11 items-center gap-1 bg-black/80 px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" className={barButtonClass} onClick={onBack} aria-label={TEXT.back}>
          <X className="size-5" />
        </button>
        <button
          type="button"
          className={barButtonClass}
          onClick={() => onPinsChange(pins.slice(0, -1))}
          disabled={pins.length === 0}
          aria-label={TEXT.undo}
        >
          <Undo2 className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-center text-xs text-white/80">
          {TEXT.markHint}
        </span>
        <span className="text-xs tabular-nums text-white/70" dir="ltr">
          {pins.length}/{MAX_PINS}
        </span>
        <button
          type="button"
          className={`${barButtonClass} bg-cyan-500/90 hover:bg-cyan-400`}
          onClick={onNext}
          disabled={pins.length < MIN_PINS}
          aria-label={TEXT.next}
        >
          <Check className="size-5" />
        </button>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-900">
        {ready ? (
          <PinSurface
            width={w}
            height={h}
            pins={pins}
            maxPins={MAX_PINS}
            onPinsChange={onPinsChange}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              draggable={false}
              className="pointer-events-none block select-none"
              style={{ width: w, height: h }}
            />
          </PinSurface>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2: live camera + overlay                                               */
/* -------------------------------------------------------------------------- */

function LiveStep({
  projectId,
  photo,
  photoPins,
  onBack,
}: {
  readonly projectId: string;
  readonly photo: PhotoAsset;
  readonly photoPins: readonly Pt[];
  readonly onBack: () => void;
}) {
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackSettings = useRef<MediaTrackSettings>({});
  const [cameraFailed, setCameraFailed] = useState(false);
  const [livePins, setLivePins] = useState<Pt[]>([]);
  const [adjust, setAdjust] = useState<Mat3>(IDENTITY);
  const [opacity, setOpacity] = useState(0.55);
  const [perspective, setPerspective] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Camera (rear camera preferred), released on exit.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        trackSettings.current = stream.getVideoTracks()[0]?.getSettings() ?? {};
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) setCameraFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Rotating the phone changes the stage shape: old taps no longer match the scene.
  const orientation = size.w >= size.h ? 'landscape' : 'portrait';
  const lastOrientation = useRef<string | null>(null);
  useEffect(() => {
    if (size.w === 0) return;
    if (lastOrientation.current && lastOrientation.current !== orientation) {
      setLivePins([]);
      setAdjust(IDENTITY);
      setResult(null);
    }
    lastOrientation.current = orientation;
  }, [orientation, size.w]);

  const alignment = useMemo(() => {
    if (size.w === 0 || livePins.length < MIN_PINS) return null;
    return computeAlignment({
      photo: photoPins.map((p) => ({ x: p.x * photo.width, y: p.y * photo.height })),
      live: livePins.map((p) => ({ x: p.x * size.w, y: p.y * size.h })),
      photoW: photo.width,
      photoH: photo.height,
      perspective,
    });
  }, [livePins, photoPins, photo.width, photo.height, size.w, size.h, perspective]);

  const matrix = alignment ? multiplyMat3(adjust, alignment.fit.matrix) : null;

  const changePins = useCallback((next: Pt[]) => {
    setLivePins(next);
    setAdjust(IDENTITY);
  }, []);
  const applyAdjust = useCallback((incremental: Mat3) => {
    setAdjust((prev) => multiplyMat3(incremental, prev));
  }, []);

  function realign() {
    setLivePins([]);
    setAdjust(IDENTITY);
    setResult(null);
  }

  function save() {
    const record = {
      savedAt: new Date().toISOString(),
      projectId,
      mode: alignment?.fit.kind ?? null,
      perspectiveRequested: perspective,
      perspectiveRejected: alignment?.perspectiveRejected ?? false,
      landmarkResidualPx: alignment ? Number(alignment.fit.rms.toFixed(2)) : null,
      stage: { width: Math.round(size.w), height: Math.round(size.h), orientation },
      photo: { width: photo.width, height: photo.height },
      photoLandmarksPx: photoPins.map((p) => [Math.round(p.x * photo.width), Math.round(p.y * photo.height)]),
      liveLandmarksPx: livePins.map((p) => [Math.round(p.x * size.w), Math.round(p.y * size.h)]),
      manualAdjustment: adjust.map((v) => Number(v.toFixed(5))),
      opacity: Number(opacity.toFixed(2)),
      camera: trackSettings.current,
      userAgent: navigator.userAgent,
    };
    const text = JSON.stringify(record, null, 2);
    setResult(text);
    setCopied(false);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  const complete = livePins.length >= photoPins.length;
  const showPerspectiveToggle = photoPins.length >= 3 && livePins.length >= 3;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-black" dir="ltr">
      {size.w > 0 ? (
        <PinSurface
          width={size.w}
          height={size.h}
          pins={livePins}
          maxPins={photoPins.length}
          onPinsChange={changePins}
          onAdjust={applyAdjust}
          highlightIndex={livePins.length < photoPins.length ? livePins.length : undefined}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          {matrix ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              style={{
                width: photo.width,
                height: photo.height,
                transformOrigin: '0 0',
                transform: toCssMatrix3d(matrix),
                opacity,
                willChange: 'transform',
              }}
            />
          ) : null}
        </PinSurface>
      ) : null}

      {complete ? null : (
        <div
          className="pointer-events-none absolute start-2 top-[max(0.5rem,env(safe-area-inset-top))] w-24 overflow-hidden rounded-md border border-white/40 bg-black/60 shadow"
          aria-hidden="true"
        >
          <div className="relative" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="absolute inset-0 size-full" draggable={false} />
            {photoPins.map((p, i) => (
              <PinMark
                key={i}
                x={p.x * 96}
                y={p.y * (96 * (photo.height / photo.width))}
                label={i + 1}
                small
                highlighted={i === livePins.length}
              />
            ))}
          </div>
          <div className="bg-black/70 text-center text-[11px] leading-4 text-white" dir="ltr">
            {Math.min(livePins.length + 1, photoPins.length)}/{photoPins.length}
          </div>
        </div>
      )}

      {cameraFailed ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-white/80" dir="rtl">
          {TEXT.cameraError}
        </div>
      ) : null}

      {perspective && alignment?.perspectiveRejected ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-auto w-fit rounded bg-black/70 px-2 py-1 text-[11px] text-white"
          dir="rtl"
        >
          {TEXT.perspectiveRejected}
        </div>
      ) : null}

      <div
        className="absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex justify-center px-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex max-w-full items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur">
          <button type="button" className={barButtonClass} onClick={onBack} aria-label={TEXT.back}>
            <X className="size-5" />
          </button>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label={TEXT.opacity}
            className="mx-1 h-6 w-24 min-w-0 shrink accent-cyan-400 sm:w-40"
          />
          <button type="button" className={barButtonClass} onClick={realign} aria-label={TEXT.realign}>
            <RotateCcw className="size-5" />
          </button>
          {showPerspectiveToggle ? (
            <button
              type="button"
              className={`${barButtonClass} ${perspective ? 'bg-cyan-500/90' : ''}`}
              onClick={() => setPerspective((v) => !v)}
              aria-pressed={perspective}
              aria-label={TEXT.perspective}
            >
              <Rotate3d className="size-5" />
            </button>
          ) : null}
          <button
            type="button"
            className={barButtonClass}
            onClick={save}
            disabled={!alignment}
            aria-label={TEXT.save}
          >
            <Check className="size-5" />
          </button>
        </div>
      </div>

      {result ? (
        <div
          className="absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] top-[max(0.5rem,env(safe-area-inset-top))] flex flex-col rounded-lg bg-black/85 p-2 text-white backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
          dir="rtl"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1">{copied ? TEXT.copied : TEXT.save}</span>
            <button
              type="button"
              className={barButtonClass}
              aria-label={TEXT.copy}
              onClick={() => {
                void navigator.clipboard?.writeText(result).then(() => setCopied(true));
              }}
            >
              <Copy className="size-4" />
            </button>
            <button type="button" className={barButtonClass} aria-label={TEXT.close} onClick={() => setResult(null)}>
              <X className="size-4" />
            </button>
          </div>
          <pre className="mt-1 min-h-0 flex-1 overflow-auto text-[10px] leading-4" dir="ltr">
            {result}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry (inside the project tab)                                              */
/* -------------------------------------------------------------------------- */

export function InfraOverlayTrial({ projectId }: { readonly projectId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [photoPins, setPhotoPins] = useState<Pt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  // Lock page scroll while the full-screen experiment is open.
  useEffect(() => {
    if (phase === 'idle') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setPhotoPins([]);
      setPhase('mark');
    } catch {
      setError(TEXT.loadError);
    }
  }

  const overlay =
    mounted && phase !== 'idle' && photo
      ? createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black text-white"
            style={{ height: '100dvh', width: '100vw' }}
            role="dialog"
            aria-label={TEXT.title}
          >
            {phase === 'mark' ? (
              <MarkStep
                photo={photo}
                pins={photoPins}
                onPinsChange={setPhotoPins}
                onBack={() => setPhase('idle')}
                onNext={() => setPhase('live')}
              />
            ) : (
              <LiveStep
                projectId={projectId}
                photo={photo}
                photoPins={photoPins}
                onBack={() => setPhase('mark')}
              />
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-3 pt-2" data-testid="infra-overlay-trial">
      <p className="text-sm text-[var(--pf-text-secondary)]">{TEXT.intro}</p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--pf-action-primary,#0e7490)] px-4 py-2 text-sm font-medium text-white">
          <Camera className="size-4" />
          {TEXT.capture}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            data-testid="infra-photo-capture"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-4 py-2 text-sm font-medium">
          <ImageUp className="size-4" />
          {TEXT.choose}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="infra-photo-choose"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {overlay}
    </div>
  );
}
