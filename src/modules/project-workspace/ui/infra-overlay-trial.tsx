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
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  ImageUp,
  Images,
  Move,
  RotateCcw,
  Rotate3d,
  Undo2,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  IDENTITY,
  REQUIRED_LANDMARKS,
  applyMat3,
  computeStageAlignment,
  fitAffine,
  fitContain,
  invertMat3,
  landmarksAreSpread,
  fitWithin,
  multiplyMat3,
  toCssMatrix3d,
  userAdjustMatrix,
  type Mat3,
  type Pt,
} from '../domain/infra-overlay-geometry';
import { InfraSaveSheet } from './infra-save-sheet';
import type {
  InfraTrialAlignment,
  InfraTrialIntegration,
  InfraTrialSaveInput,
} from './infra-trial-integration';

const MAX_PHOTO_SIDE = 1600;
/** A pin is placed exactly where the finger touches (no offset). */
const MAX_PINS = REQUIRED_LANDMARKS;
const PIN_HIT_RADIUS_PX = 24;

const TEXT = {
  title: 'זיהוי תשתיות',
  introLive:
    'ניסוי: בוחרים תמונה מלפני סגירת הקיר, מסמנים 4 נקודות זיהוי, ואז מציגים אותה שקופה מעל המצלמה החיה. שום דבר לא נשמר או נשלח.',
  introTwo:
    'ניסוי: בוחרים תמונת לפני סגירה ותמונת אחרי סגירה, מסמנים בשתיהן אותן 4 נקודות, ומשווים בעזרת שקיפות. שום דבר לא נשמר או נשלח.',
  introLiveSaved:
    'בוחרים תמונה מלפני סגירת הקיר (מהמצלמה, מהגלריה של הפרויקט, מהאחסון המחובר או מהטלפון), מסמנים 4 נקודות זיהוי, ואז מציגים אותה שקופה מעל המצלמה החיה. שום דבר לא נשמר אלא אם תבחרו לשמור.',
  introTwoSaved:
    'בוחרים תמונת לפני סגירה ותמונת אחרי סגירה (מהמצלמה, מהגלריה של הפרויקט, מהאחסון המחובר או מהטלפון), מסמנים בשתיהן אותן 4 נקודות, ומשווים בעזרת שקיפות. שום דבר לא נשמר אלא אם תבחרו לשמור.',
  modeTwo: '2 תמונות',
  modeLiveDesc: 'תמונת לפני + מצלמה חיה בשטח, עם התשתיות שקופות מעל הקיר.',
  modeTwoDesc: 'השוואה בין תמונת לפני סגירה לתמונת אחרי סגירה.',
  backToModes: 'חזרה לבחירת מצב',
  liveCapture: 'צילום תמונת לפני',
  liveChoose: 'בחירת תמונת לפני קיימת',
  useSelected: 'המשך עם התמונה שנבחרה',
  modeLive: 'מצלמה חיה',
  slotBefore: 'לפני סגירה',
  slotAfter: 'אחרי סגירה',
  start: 'המשך',
  markAfterHint: 'סמנו את אותן 4 נקודות, באותו סדר',
  moveLayer: 'התאמת השכבה',
  zoomView: 'הגדלת תצוגה',
  capture: 'צילום תמונה',
  choose: 'בחירת תמונה',
  loadError: 'לא ניתן לקרוא את התמונה',
  markHint: 'סמנו 4 נקודות קבועות, מפוזרות על פני הקיר',
  markOrderNote: 'יש לבחור את הנקודות לפי הסדר המסומן בתמונת המקור (1–4).',
  alignFailed: 'ההתאמה לא הצליחה. בדקו שהנקודות מסומנות לפי הסדר 1–4 כמו בתמונת המקור, וגררו נקודה כדי לתקן.',
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
  /** The untouched source file (kept only so the user can explicitly save it later). */
  readonly file?: File;
  /** Set when the photo came from the infrastructure gallery. */
  readonly captureId?: string | null;
}

type Phase = 'idle' | 'markBefore' | 'markAfter' | 'live' | 'compare';
type Mode = 'two' | 'live';
type Slot = 'before' | 'after';

interface GestureParts {
  readonly pivot: Pt;
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
  readonly rotation: number;
}

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

/* -------------------------------------------------------------------------- */
/* Explicit save helpers (only used when the workspace integration is present)  */
/* -------------------------------------------------------------------------- */

const SNAPSHOT_MAX_SIDE = 1600;

function matrixToAdjust(m: Mat3): { tx: number; ty: number; scale: number; rotation: number } {
  return { tx: m[2], ty: m[5], scale: Math.hypot(m[0], m[3]), rotation: Math.atan2(m[3], m[0]) };
}

function isIdentityAdjust(m: Mat3): boolean {
  return m.every((value, index) => Math.abs(value - IDENTITY[index]!) < 1e-9);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function pinsToTuples(pins: readonly Pt[]): [number, number][] {
  return pins.map((pin) => [round4(clamp01(pin.x)), round4(clamp01(pin.y))]);
}

/** Canvas 2D has no perspective: for the snapshot only, a homography is replaced by its best affine fit. */
function canvasMatrix(matrix: Mat3, photoW: number, photoH: number): Mat3 {
  if (Math.abs(matrix[6]) < 1e-9 && Math.abs(matrix[7]) < 1e-9) return matrix;
  const src: Pt[] = [
    { x: 0, y: 0 },
    { x: photoW, y: 0 },
    { x: photoW, y: photoH },
    { x: 0, y: photoH },
  ];
  const dst = src.map((p) => applyMat3(matrix, p));
  return fitAffine(src, dst)?.matrix ?? matrix;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.9);
  });
}

function snapshotScale(w: number, h: number): number {
  return Math.min(1, SNAPSHOT_MAX_SIDE / Math.max(w, h, 1));
}

/** The live camera frame, cropped exactly like the on-screen `object-cover` video (stage-shaped). */
function grabFrameCanvas(video: HTMLVideoElement, stageW: number, stageH: number): HTMLCanvasElement | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || stageW <= 0 || stageH <= 0) return null;
  const k = snapshotScale(stageW, stageH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(stageW * k));
  canvas.height = Math.max(1, Math.round(stageH * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const cover = Math.max(stageW / vw, stageH / vh);
  const dw = vw * cover;
  const dh = vh * cover;
  ctx.scale(k, k);
  ctx.drawImage(video, (stageW - dw) / 2, (stageH - dh) / 2, dw, dh);
  return canvas;
}

/** Overlay snapshot in stage coordinates: backdrop first, then the transparent "before" layer. */
async function renderResultFile(input: {
  readonly stageW: number;
  readonly stageH: number;
  readonly drawBackdrop: (ctx: CanvasRenderingContext2D) => void;
  readonly overlay: PhotoAsset;
  readonly overlayMatrix: Mat3;
  readonly opacity: number;
}): Promise<File | null> {
  const k = snapshotScale(input.stageW, input.stageH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(input.stageW * k));
  canvas.height = Math.max(1, Math.round(input.stageH * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const overlay = await loadImage(input.overlay.url);
  ctx.scale(k, k);
  input.drawBackdrop(ctx);
  const m = canvasMatrix(input.overlayMatrix, input.overlay.width, input.overlay.height);
  ctx.save();
  ctx.globalAlpha = input.opacity;
  ctx.setTransform(m[0] * k, m[3] * k, m[1] * k, m[4] * k, m[2] * k, m[5] * k);
  ctx.drawImage(overlay, 0, 0, input.overlay.width, input.overlay.height);
  ctx.restore();
  return canvasToFile(canvas, 'result.jpg');
}

async function fetchAsFile(url: string, name: string): Promise<File> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('fetch');
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
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
  readonly onAdjust?: (incremental: Mat3, parts: GestureParts) => void;
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
      grab.current = { x: 0, y: 0 };
      activeIndex.current = current.length;
      mode.current = 'pin';
      latest.current.onPinsChange([
        ...current,
        { x: clamp01(p.x / w), y: clamp01(p.y / h) },
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
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Small copy of the "before" photo showing which landmark to mark next. */
function ReferenceThumb({
  photo,
  pins,
  nextIndex,
}: {
  readonly photo: PhotoAsset;
  readonly pins: readonly Pt[];
  readonly nextIndex: number;
}) {
  return (
    <div
      className="pointer-events-none absolute start-2 top-[max(0.5rem,env(safe-area-inset-top))] w-24 overflow-hidden rounded-md border border-white/40 bg-black/60 shadow"
      aria-hidden="true"
    >
      <div className="relative" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" className="absolute inset-0 size-full" draggable={false} />
        {pins.map((p, i) => (
          <PinMark
            key={i}
            x={p.x * 96}
            y={p.y * (96 * (photo.height / photo.width))}
            label={i + 1}
            small
            highlighted={i === nextIndex}
          />
        ))}
      </div>
      <div className="bg-black/70 text-center text-[11px] leading-4 text-white" dir="ltr">
        {Math.min(nextIndex + 1, pins.length)}/{pins.length}
      </div>
    </div>
  );
}

/** The old photo drawn through the alignment matrix (stage pixels). */
function OverlayImage({
  photo,
  matrix,
  opacity,
}: {
  readonly photo: PhotoAsset;
  readonly matrix: Mat3;
  readonly opacity: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
      data-testid="infra-overlay-layer"
      style={{
        width: photo.width,
        height: photo.height,
        transformOrigin: '0 0',
        transform: toCssMatrix3d(matrix),
        opacity,
        willChange: 'transform',
      }}
    />
  );
}

function OverlayBar({
  opacity,
  onOpacity,
  onBack,
  onRealign,
  showPerspectiveToggle,
  perspective,
  onTogglePerspective,
  extra,
  onSave,
  canSave,
}: {
  readonly opacity: number;
  readonly onOpacity: (v: number) => void;
  readonly onBack: () => void;
  readonly onRealign: () => void;
  readonly showPerspectiveToggle: boolean;
  readonly perspective: boolean;
  readonly onTogglePerspective: () => void;
  readonly extra?: ReactNode;
  readonly onSave: () => void;
  readonly canSave: boolean;
}) {
  return (
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
          onChange={(e) => onOpacity(Number(e.target.value))}
          aria-label={TEXT.opacity}
          className="mx-1 h-6 w-24 min-w-0 shrink accent-cyan-400 sm:w-40"
        />
        <button type="button" className={barButtonClass} onClick={onRealign} aria-label={TEXT.realign}>
          <RotateCcw className="size-5" />
        </button>
        {showPerspectiveToggle ? (
          <button
            type="button"
            className={`${barButtonClass} ${perspective ? 'bg-cyan-500/90' : ''}`}
            onClick={onTogglePerspective}
            aria-pressed={perspective}
            aria-label={TEXT.perspective}
          >
            <Rotate3d className="size-5" />
          </button>
        ) : null}
        {extra}
        <button
          type="button"
          className={barButtonClass}
          onClick={onSave}
          disabled={!canSave}
          aria-label={TEXT.save}
        >
          <Check className="size-5" />
        </button>
      </div>
    </div>
  );
}

function useSavedResult() {
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const publish = useCallback((record: unknown) => {
    const text = JSON.stringify(record, null, 2);
    setResult(text);
    setCopied(false);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }, []);
  const clear = useCallback(() => setResult(null), []);
  const copy = useCallback(() => {
    if (result) void navigator.clipboard?.writeText(result).then(() => setCopied(true));
  }, [result]);
  return { result, copied, publish, clear, copy } as const;
}

function ResultSheet({
  result,
  copied,
  onCopy,
  onClose,
}: {
  readonly result: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] top-[max(0.5rem,env(safe-area-inset-top))] flex flex-col rounded-lg bg-black/85 p-2 text-white backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      dir="rtl"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="flex-1">{copied ? TEXT.copied : TEXT.save}</span>
        <button type="button" className={barButtonClass} aria-label={TEXT.copy} onClick={onCopy}>
          <Copy className="size-4" />
        </button>
        <button type="button" className={barButtonClass} aria-label={TEXT.close} onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <pre className="mt-1 min-h-0 flex-1 overflow-auto text-[10px] leading-4" dir="ltr">
        {result}
      </pre>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Landmarks on a photo (before, or after in two-photo mode)                    */
/* -------------------------------------------------------------------------- */

function MarkStep({
  photo,
  pins,
  hint,
  reference,
  onPinsChange,
  onBack,
  onNext,
}: {
  readonly photo: PhotoAsset;
  readonly pins: readonly Pt[];
  readonly hint: string;
  /** "Before" photo + its landmarks, shown while marking the same points on the "after" photo. */
  readonly reference?: { readonly photo: PhotoAsset; readonly pins: readonly Pt[] };
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
        <span className="line-clamp-2 min-w-0 flex-1 px-1 text-center text-xs text-white/80">{hint}</span>
        <span className="text-xs tabular-nums text-white/70" dir="ltr">
          {pins.length}/{MAX_PINS}
        </span>
        <button
          type="button"
          className={`${barButtonClass} bg-cyan-500/90 hover:bg-cyan-400`}
          onClick={onNext}
          disabled={pins.length < MAX_PINS || !landmarksAreSpread(pins)}
          aria-label={TEXT.next}
        >
          <Check className="size-5" />
        </button>
      </div>
      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-900"
      >
        {ready ? (
          <PinSurface width={w} height={h} pins={pins} maxPins={MAX_PINS} onPinsChange={onPinsChange}>
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
        {reference && pins.length < MAX_PINS ? (
          <ReferenceThumb photo={reference.photo} pins={reference.pins} nextIndex={pins.length} />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Live camera + overlay                                                       */
/* -------------------------------------------------------------------------- */

function LiveStep({
  projectId,
  photo,
  photoPins,
  onBack,
  integration,
}: {
  readonly projectId: string;
  readonly photo: PhotoAsset;
  readonly photoPins: readonly Pt[];
  readonly onBack: () => void;
  readonly integration?: InfraTrialIntegration;
}) {
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const [saveRequest, setSaveRequest] = useState<{ input: InfraTrialSaveInput; previewUrl: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackSettings = useRef<MediaTrackSettings>({});
  const [cameraFailed, setCameraFailed] = useState(false);
  const [livePins, setLivePins] = useState<Pt[]>([]);
  const [adjust, setAdjust] = useState<Mat3>(IDENTITY);
  const [opacity, setOpacity] = useState(0.55);
  const [perspective, setPerspective] = useState(false);
  const saved = useSavedResult();

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
  const { clear: clearSaved } = saved;
  useEffect(() => {
    if (size.w === 0) return;
    if (lastOrientation.current && lastOrientation.current !== orientation) {
      setLivePins([]);
      setAdjust(IDENTITY);
      clearSaved();
    }
    lastOrientation.current = orientation;
  }, [orientation, size.w, clearSaved]);

  const alignment = useMemo(() => {
    if (size.w === 0 || livePins.length < MAX_PINS) return null;
    return computeStageAlignment({
      photoW: photo.width,
      photoH: photo.height,
      photoPins,
      targetPx: livePins.map((p) => ({ x: p.x * size.w, y: p.y * size.h })),
      stageW: size.w,
      stageH: size.h,
      perspective,
      checkSpreadOnStage: true,
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
    clearSaved();
  }

  /** Workspace integration: freeze the current frame + overlay, then let the user choose what to keep. */
  async function requestSave() {
    const video = videoRef.current;
    if (!video || !alignment || !matrix || preparing) return;
    setPreparing(true);
    try {
      const frame = grabFrameCanvas(video, size.w, size.h);
      if (!frame) return;
      const afterFile = await canvasToFile(frame, 'after-live.jpg');
      const resultFile = await renderResultFile({
        stageW: size.w,
        stageH: size.h,
        drawBackdrop: (ctx) => ctx.drawImage(frame, 0, 0, size.w, size.h),
        overlay: photo,
        overlayMatrix: matrix,
        opacity,
      });
      const record: InfraTrialAlignment = {
        version: 1,
        kind: alignment.fit.kind === 'homography' ? 'perspective' : 'similarity',
        beforePins: pinsToTuples(photoPins),
        afterPins: pinsToTuples(livePins),
        adjust: isIdentityAdjust(adjust) ? null : matrixToAdjust(adjust),
        stage: { w: Math.round(size.w), h: Math.round(size.h) },
        opacity: round4(opacity),
        view: 'overlay',
      };
      setSaveRequest({
        input: {
          mode: 'live',
          alignment: record,
          reliable: !(perspective && alignment.perspectiveRejected),
          beforeCaptureId: photo.captureId ?? null,
          beforeFile: photo.file ?? null,
          afterFile,
          resultFile,
        },
        previewUrl: resultFile ? URL.createObjectURL(resultFile) : null,
      });
    } finally {
      setPreparing(false);
    }
  }

  function closeSaveRequest() {
    setSaveRequest((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  function save() {
    if (integration) {
      void requestSave();
      return;
    }
    saved.publish({
      savedAt: new Date().toISOString(),
      projectId,
      source: 'live-camera',
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
    });
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
          {matrix ? <OverlayImage photo={photo} matrix={matrix} opacity={opacity} /> : null}
        </PinSurface>
      ) : null}

      {complete && alignment ? null : <ReferenceThumb photo={photo} pins={photoPins} nextIndex={livePins.length} />}

      {complete ? null : (
        <div
          className="pointer-events-none absolute left-28 right-2 top-[max(0.5rem,env(safe-area-inset-top))] rounded bg-black/70 px-2 py-1 text-center text-[11px] leading-4 text-white"
          dir="rtl"
        >
          {TEXT.markOrderNote}
        </div>
      )}

      {complete && !alignment ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-auto w-fit max-w-full rounded bg-black/70 px-2 py-1 text-center text-[11px] text-white"
          dir="rtl"
          role="status"
          data-testid="infra-align-failed"
        >
          {TEXT.alignFailed}
        </div>
      ) : null}

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

      <OverlayBar
        opacity={opacity}
        onOpacity={setOpacity}
        onBack={onBack}
        onRealign={realign}
        showPerspectiveToggle={showPerspectiveToggle}
        perspective={perspective}
        onTogglePerspective={() => setPerspective((v) => !v)}
        onSave={save}
        canSave={Boolean(alignment) && !preparing}
      />

      {saved.result ? (
        <ResultSheet result={saved.result} copied={saved.copied} onCopy={saved.copy} onClose={saved.clear} />
      ) : null}
      {integration && saveRequest ? (
        <InfraSaveSheet
          input={saveRequest.input}
          previewUrl={saveRequest.previewUrl}
          integration={integration}
          onClose={closeSaveRequest}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Two photos: "after" photo is the backdrop instead of the live video          */
/* -------------------------------------------------------------------------- */

const VIEW_MIN_SCALE = 1;
const VIEW_MAX_SCALE = 10;

function matrixScale(m: Mat3): number {
  return Math.hypot(m[0], m[3]);
}

function CompareStep({
  projectId,
  before,
  beforePins,
  after,
  afterPins,
  onAfterPinsChange,
  onBack,
  onRealign,
  integration,
  initial,
}: {
  readonly projectId: string;
  readonly before: PhotoAsset;
  readonly beforePins: readonly Pt[];
  readonly after: PhotoAsset;
  readonly afterPins: readonly Pt[];
  /** Lets the user fix the "after" points right here when the alignment fails. */
  readonly onAfterPinsChange: (pins: Pt[]) => void;
  readonly onBack: () => void;
  readonly onRealign: () => void;
  readonly integration?: InfraTrialIntegration;
  /** A saved result being reopened: restores the stored adjustment / opacity / fit kind. */
  readonly initial?: InfraTrialAlignment | null;
}) {
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const [saveRequest, setSaveRequest] = useState<{ input: InfraTrialSaveInput; previewUrl: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [adjust, setAdjust] = useState<Mat3>(IDENTITY);
  const [view, setView] = useState<Mat3>(IDENTITY);
  const [viewMode, setViewMode] = useState<'layer' | 'view'>('layer');
  const [opacity, setOpacity] = useState(0.55);
  const [perspective, setPerspective] = useState(false);
  const saved = useSavedResult();
  const { clear: clearSaved } = saved;

  // "after" photo (its own pixels) -> stage pixels, aspect ratio preserved.
  const base = useMemo(
    () => (size.w > 0 ? fitContain(after.width, after.height, size.w, size.h) : IDENTITY),
    [after.width, after.height, size.w, size.h],
  );

  // A different stage shape invalidates manual tweaks and zoom.
  const stageKey = `${Math.round(size.w)}x${Math.round(size.h)}`;
  const lastStage = useRef<string | null>(null);
  useEffect(() => {
    if (size.w === 0) return;
    if (lastStage.current && lastStage.current !== stageKey) {
      setAdjust(IDENTITY);
      setView(IDENTITY);
      clearSaved();
    }
    lastStage.current = stageKey;
  }, [stageKey, size.w, clearSaved]);

  // Reopening a saved result: restore its manual adjustment (scaled to this stage), opacity and fit kind.
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (!initial || appliedInitial.current || size.w === 0) return;
    appliedInitial.current = true;
    if (initial.adjust) {
      const sx = initial.stage.w > 0 ? size.w / initial.stage.w : 1;
      const sy = initial.stage.h > 0 ? size.h / initial.stage.h : 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restores a saved alignment once
      setAdjust(userAdjustMatrix({ x: 0, y: 0 }, { ...initial.adjust, tx: initial.adjust.tx * sx, ty: initial.adjust.ty * sy }));
    }
    setOpacity(initial.opacity);
    setPerspective(initial.kind === 'perspective');
  }, [initial, size.w, size.h]);

  const targetPx = useMemo(
    () => afterPins.map((p) => applyMat3(base, { x: p.x * after.width, y: p.y * after.height })),
    [afterPins, after.width, after.height, base],
  );

  const alignment = useMemo(
    () =>
      computeStageAlignment({
        photoW: before.width,
        photoH: before.height,
        photoPins: beforePins,
        targetPx,
        stageW: size.w,
        stageH: size.h,
        perspective,
        checkSpreadOnStage: false, // spread is enforced on the "after" photo itself
      }),
    [before.width, before.height, beforePins, targetPx, size.w, size.h, perspective],
  );

  const matrix = alignment ? multiplyMat3(adjust, alignment.fit.matrix) : null;

  // When the alignment fails the "after" points are shown on the comparison so they can be dragged into place
  // (no going back, no re-choosing photos). They live in the after photo's coordinates; the stage shows them
  // through the same base + view transforms as the photo.
  const alignFailed = !alignment && size.w > 0 && afterPins.length >= MAX_PINS;
  const pinsToStage = useMemo(() => multiplyMat3(view, base), [view, base]);
  const stagePins = useMemo(
    () =>
      alignFailed
        ? afterPins.map((p) => {
            const q = applyMat3(pinsToStage, { x: p.x * after.width, y: p.y * after.height });
            return { x: q.x / size.w, y: q.y / size.h };
          })
        : [],
    [alignFailed, afterPins, pinsToStage, after.width, after.height, size.w, size.h],
  );
  const changeStagePins = useCallback(
    (next: Pt[]) => {
      const back = invertMat3(pinsToStage);
      onAfterPinsChange(
        next.map((p) => {
          const q = applyMat3(back, { x: p.x * size.w, y: p.y * size.h });
          return { x: clamp01(q.x / after.width), y: clamp01(q.y / after.height) };
        }),
      );
    },
    [pinsToStage, size.w, size.h, after.width, after.height, onAfterPinsChange],
  );

  const onGesture = useCallback(
    (incremental: Mat3, parts: GestureParts) => {
      if (viewMode === 'layer') {
        // Gesture coordinates are screen pixels; the layer lives under the view transform.
        const inView = multiplyMat3(invertMat3(view), multiplyMat3(incremental, view));
        setAdjust((prev) => multiplyMat3(inView, prev));
        return;
      }
      // Zoom/pan the whole comparison (both images together); never rotate the view.
      const zoom = userAdjustMatrix(parts.pivot, { ...parts, rotation: 0 });
      setView((prev) => {
        const next = multiplyMat3(zoom, prev);
        const s = matrixScale(next);
        return s < VIEW_MIN_SCALE || s > VIEW_MAX_SCALE ? prev : next;
      });
    },
    [view, viewMode],
  );

  async function requestSave() {
    if (!alignment || !matrix || preparing || size.w === 0) return;
    setPreparing(true);
    try {
      const afterImage = await loadImage(after.url);
      const resultFile = await renderResultFile({
        stageW: size.w,
        stageH: size.h,
        drawBackdrop: (ctx) => {
          ctx.save();
          ctx.setTransform(
            base[0] * snapshotScale(size.w, size.h),
            base[3] * snapshotScale(size.w, size.h),
            base[1] * snapshotScale(size.w, size.h),
            base[4] * snapshotScale(size.w, size.h),
            base[2] * snapshotScale(size.w, size.h),
            base[5] * snapshotScale(size.w, size.h),
          );
          ctx.drawImage(afterImage, 0, 0, after.width, after.height);
          ctx.restore();
        },
        overlay: before,
        overlayMatrix: matrix,
        opacity,
      });
      const record: InfraTrialAlignment = {
        version: 1,
        kind: alignment.fit.kind === 'homography' ? 'perspective' : 'similarity',
        beforePins: pinsToTuples(beforePins),
        afterPins: pinsToTuples(afterPins),
        adjust: isIdentityAdjust(adjust) ? null : matrixToAdjust(adjust),
        stage: { w: Math.round(size.w), h: Math.round(size.h) },
        opacity: round4(opacity),
        view: 'overlay',
      };
      setSaveRequest({
        input: {
          mode: 'two_photos',
          alignment: record,
          reliable: !(perspective && alignment.perspectiveRejected),
          beforeCaptureId: before.captureId ?? null,
          beforeFile: before.file ?? null,
          afterFile: after.file ?? null,
          resultFile,
        },
        previewUrl: resultFile ? URL.createObjectURL(resultFile) : null,
      });
    } finally {
      setPreparing(false);
    }
  }

  function closeSaveRequest() {
    setSaveRequest((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  function save() {
    if (integration) {
      void requestSave();
      return;
    }
    saved.publish({
      savedAt: new Date().toISOString(),
      projectId,
      source: 'two-photos',
      mode: alignment?.fit.kind ?? null,
      perspectiveRequested: perspective,
      perspectiveRejected: alignment?.perspectiveRejected ?? false,
      landmarkResidualPx: alignment ? Number(alignment.fit.rms.toFixed(2)) : null,
      stage: { width: Math.round(size.w), height: Math.round(size.h) },
      before: { width: before.width, height: before.height },
      after: { width: after.width, height: after.height },
      beforeLandmarksPx: beforePins.map((p) => [Math.round(p.x * before.width), Math.round(p.y * before.height)]),
      afterLandmarksPx: afterPins.map((p) => [Math.round(p.x * after.width), Math.round(p.y * after.height)]),
      manualAdjustment: adjust.map((v) => Number(v.toFixed(5))),
      view: view.map((v) => Number(v.toFixed(5))),
      opacity: Number(opacity.toFixed(2)),
      userAgent: navigator.userAgent,
    });
  }

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden bg-neutral-900"
      dir="ltr"
      data-testid="infra-compare"
      onWheel={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const zoom = userAdjustMatrix(
          { x: e.clientX - r.left, y: e.clientY - r.top },
          { tx: 0, ty: 0, scale: Math.exp(-e.deltaY * 0.002), rotation: 0 },
        );
        setView((prev) => {
          const next = multiplyMat3(zoom, prev);
          const s = matrixScale(next);
          return s < VIEW_MIN_SCALE || s > VIEW_MAX_SCALE ? prev : next;
        });
      }}
    >
      {size.w > 0 ? (
        <PinSurface
          width={size.w}
          height={size.h}
          pins={stagePins}
          maxPins={stagePins.length}
          onPinsChange={changeStagePins}
          onAdjust={onGesture}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              width: size.w,
              height: size.h,
              transformOrigin: '0 0',
              transform: toCssMatrix3d(view),
              willChange: 'transform',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={after.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              data-testid="infra-after-image"
              style={{
                width: after.width,
                height: after.height,
                transformOrigin: '0 0',
                transform: toCssMatrix3d(base),
              }}
            />
            {matrix ? <OverlayImage photo={before} matrix={matrix} opacity={opacity} /> : null}
          </div>
        </PinSurface>
      ) : null}

      {perspective && alignment?.perspectiveRejected ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-auto w-fit rounded bg-black/70 px-2 py-1 text-[11px] text-white"
          dir="rtl"
        >
          {TEXT.perspectiveRejected}
        </div>
      ) : null}

      {alignFailed ? (
        <>
          <ReferenceThumb photo={before} pins={beforePins} nextIndex={beforePins.length} />
          <div
            className="pointer-events-none absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-auto w-fit max-w-full rounded bg-black/70 px-2 py-1 text-center text-[11px] text-white"
            dir="rtl"
            role="status"
            data-testid="infra-align-failed"
          >
            {TEXT.alignFailed}
          </div>
        </>
      ) : null}

      <OverlayBar
        opacity={opacity}
        onOpacity={setOpacity}
        onBack={onBack}
        onRealign={onRealign}
        showPerspectiveToggle
        perspective={perspective}
        onTogglePerspective={() => setPerspective((v) => !v)}
        extra={
          <button
            type="button"
            className={`${barButtonClass} ${viewMode === 'view' ? 'bg-cyan-500/90' : ''}`}
            onClick={() => setViewMode((m) => (m === 'layer' ? 'view' : 'layer'))}
            aria-pressed={viewMode === 'view'}
            aria-label={viewMode === 'view' ? TEXT.moveLayer : TEXT.zoomView}
            data-testid="infra-view-mode"
          >
            {viewMode === 'view' ? <ZoomIn className="size-5" /> : <Move className="size-5" />}
          </button>
        }
        onSave={save}
        canSave={Boolean(alignment) && !preparing && !initial}
      />

      {saved.result ? (
        <ResultSheet result={saved.result} copied={saved.copied} onCopy={saved.copy} onClose={saved.clear} />
      ) : null}
      {integration && saveRequest ? (
        <InfraSaveSheet
          input={saveRequest.input}
          previewUrl={saveRequest.previewUrl}
          integration={integration}
          onClose={closeSaveRequest}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry (inside the project tab)                                              */
/* -------------------------------------------------------------------------- */

const pickButtonPrimary =
  'inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--pf-action-primary,#0e7490)] px-4 py-2 text-sm font-medium text-white';
const pickButtonSecondary =
  'inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-4 py-2 text-sm font-medium';

function PhotoPicker({
  testIdPrefix,
  onFile,
  compact,
  captureLabel,
  chooseLabel,
}: {
  readonly testIdPrefix: string;
  readonly onFile: (file: File | undefined) => void;
  readonly compact?: boolean;
  readonly captureLabel?: string;
  readonly chooseLabel?: string;
}) {
  const size = compact ? 'px-3 py-1.5' : '';
  return (
    <>
      <label className={`${pickButtonPrimary} ${size}`}>
        <Camera className="size-4" />
        {captureLabel ?? TEXT.capture}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          data-testid={`${testIdPrefix}-capture`}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      <label className={`${pickButtonSecondary} ${size}`}>
        <ImageUp className="size-4" />
        {chooseLabel ?? TEXT.choose}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          data-testid={`${testIdPrefix}-choose`}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
    </>
  );
}

export function InfraOverlayTrial({
  projectId,
  integration,
}: {
  readonly projectId: string;
  /** Workspace wiring (extra photo sources, explicit save, reopen). Omit for the stand-alone experiment. */
  readonly integration?: InfraTrialIntegration;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [before, setBefore] = useState<PhotoAsset | null>(null);
  const [after, setAfter] = useState<PhotoAsset | null>(null);
  const [beforePins, setBeforePins] = useState<Pt[]>([]);
  const [afterPins, setAfterPins] = useState<Pt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reopened, setReopened] = useState<InfraTrialAlignment | null>(null);
  const initialRef = useRef(integration?.initial ?? null);

  // Reopen a saved result straight into the comparison view.
  useEffect(() => {
    const initial = initialRef.current;
    if (!initial) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [beforeFile, afterFile] = await Promise.all([
          fetchAsFile(initial.beforeUrl, 'before.jpg'),
          fetchAsFile(initial.afterUrl, 'after.jpg'),
        ]);
        const [preparedBefore, preparedAfter] = await Promise.all([preparePhoto(beforeFile), preparePhoto(afterFile)]);
        if (cancelled) {
          URL.revokeObjectURL(preparedBefore.url);
          URL.revokeObjectURL(preparedAfter.url);
          return;
        }
        setMode('two');
        setBefore({ ...preparedBefore, file: beforeFile });
        setAfter({ ...preparedAfter, file: afterFile });
        setBeforePins(initial.alignment.beforePins.map(([x, y]) => ({ x, y })));
        setAfterPins(initial.alignment.afterPins.map(([x, y]) => ({ x, y })));
        setReopened(initial.alignment);
        setPhase('compare');
      } catch {
        if (!cancelled) setError(TEXT.loadError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  useEffect(() => {
    return () => {
      if (before) URL.revokeObjectURL(before.url);
    };
  }, [before]);
  useEffect(() => {
    return () => {
      if (after) URL.revokeObjectURL(after.url);
    };
  }, [after]);

  // Lock page scroll while the full-screen experiment is open.
  useEffect(() => {
    if (phase === 'idle') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  async function onFile(slot: Slot, file: File | undefined, captureId?: string | null) {
    if (!file) return;
    setError(null);
    try {
      const prepared = { ...(await preparePhoto(file)), file, captureId: captureId ?? null };
      if (slot === 'before') {
        setBefore(prepared);
        setBeforePins([]);
        setAfterPins([]);
        setReopened(null);
        if (mode === 'live') setPhase('markBefore');
      } else {
        setAfter(prepared);
        setAfterPins([]);
        setReopened(null);
      }
    } catch {
      setError(TEXT.loadError);
    }
  }

  // A photo picked in the gallery dialog goes straight into the chosen locating mode.
  const preset = integration?.preset ?? null;
  const presetKey = preset?.key ?? null;
  useEffect(() => {
    if (!preset) return;
    const wanted: Mode = preset.target === 'live-before' ? 'live' : 'two';
    if (mode !== wanted) chooseMode(wanted);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies an external pick once
    void onFile(preset.target === 'two-after' ? 'after' : 'before', preset.photo.file, preset.photo.captureId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per pick
  }, [presetKey]);

  const canStartTwo = Boolean(before && after);

  let step: ReactNode = null;
  if (phase === 'markBefore' && before) {
    step = (
      <MarkStep
        photo={before}
        pins={beforePins}
        hint={TEXT.markHint}
        onPinsChange={setBeforePins}
        onBack={() => setPhase('idle')}
        onNext={() => setPhase(mode === 'two' ? 'markAfter' : 'live')}
      />
    );
  } else if (phase === 'markAfter' && before && after) {
    step = (
      <MarkStep
        photo={after}
        pins={afterPins}
        hint={`${TEXT.markAfterHint}. ${TEXT.markOrderNote}`}
        reference={{ photo: before, pins: beforePins }}
        onPinsChange={setAfterPins}
        onBack={() => setPhase('markBefore')}
        onNext={() => setPhase('compare')}
      />
    );
  } else if (phase === 'live' && before) {
    step = (
      <LiveStep
        projectId={projectId}
        photo={before}
        photoPins={beforePins}
        onBack={() => setPhase('markBefore')}
        integration={integration}
      />
    );
  } else if (phase === 'compare' && before && after) {
    step = (
      <CompareStep
        projectId={projectId}
        before={before}
        beforePins={beforePins}
        after={after}
        afterPins={afterPins}
        onAfterPinsChange={setAfterPins}
        integration={integration}
        initial={reopened}
        onBack={() => {
          if (reopened) {
            chooseMode(null);
            integration?.onExit?.();
            return;
          }
          setPhase('markAfter');
        }}
        onRealign={() => {
          setReopened(null);
          setAfterPins([]);
          setPhase('markAfter');
        }}
      />
    );
  }

  const overlay =
    mounted && step
      ? createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black text-white"
            style={{ height: '100dvh', width: '100vw' }}
            role="dialog"
            aria-label={TEXT.title}
          >
            {step}
          </div>,
          document.body,
        )
      : null;

  function chooseMode(next: Mode | null) {
    // Each mode is its own flow: never carry photos or landmarks over from the other one.
    setMode(next);
    setPhase('idle');
    setBefore(null);
    setAfter(null);
    setBeforePins([]);
    setAfterPins([]);
    setReopened(null);
    setError(null);
  }

  const modeCardClass =
    'flex flex-1 flex-col items-start gap-1 rounded-lg border border-[var(--pf-border-default)] p-4 text-start hover:bg-[var(--pf-action-subtle-active)]';

  return (
    <div className="flex max-w-2xl flex-col gap-3 pt-2" data-testid="infra-overlay-trial">
      {mode === null ? (
        <div className="flex flex-col gap-3 sm:flex-row" data-testid="infra-mode-select">
          <button
            type="button"
            className={modeCardClass}
            data-testid="infra-mode-live"
            onClick={() => chooseMode('live')}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Video className="size-5" />
              {TEXT.modeLive}
            </span>
            <span className="text-sm text-[var(--pf-text-secondary)]">{TEXT.modeLiveDesc}</span>
          </button>
          <button
            type="button"
            className={modeCardClass}
            data-testid="infra-mode-two"
            onClick={() => chooseMode('two')}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Images className="size-5" />
              {TEXT.modeTwo}
            </span>
            <span className="text-sm text-[var(--pf-text-secondary)]">{TEXT.modeTwoDesc}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => chooseMode(null)}
          data-testid="infra-mode-back"
          className="inline-flex w-fit items-center gap-1 text-sm text-[var(--pf-text-brand)] hover:underline"
        >
          <ArrowRight className="size-4" />
          {TEXT.backToModes}
        </button>
      )}

      {mode === 'live' ? (
        <div className="flex flex-col gap-3" data-testid="infra-live-setup">
          <h3 className="text-base font-semibold">{TEXT.modeLive}</h3>
          <p className="text-sm text-[var(--pf-text-secondary)]">{integration ? TEXT.introLiveSaved : TEXT.introLive}</p>
          <div className="flex flex-wrap gap-2">
            <PhotoPicker
              testIdPrefix="infra-photo"
              captureLabel={TEXT.liveCapture}
              chooseLabel={TEXT.liveChoose}
              onFile={(f) => void onFile('before', f)}
            />
            {integration?.renderPhotoSources?.('before', (photo) => void onFile('before', photo.file, photo.captureId))}
          </div>
          {before ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={before.url}
                alt=""
                className="h-12 w-12 rounded border border-[var(--pf-border-default)] object-cover"
                data-testid="infra-thumb-before"
              />
              <button
                type="button"
                data-testid="infra-live-continue"
                onClick={() => setPhase('markBefore')}
                className={pickButtonPrimary}
              >
                {TEXT.useSelected}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'two' ? (
        <div className="flex flex-col gap-3" data-testid="infra-two-setup">
          <h3 className="text-base font-semibold">{TEXT.modeTwo}</h3>
          <p className="text-sm text-[var(--pf-text-secondary)]">{integration ? TEXT.introTwoSaved : TEXT.introTwo}</p>
          {(['before', 'after'] as const).map((slot) => {
            const asset = slot === 'before' ? before : after;
            return (
              <div key={slot} className="flex flex-wrap items-center gap-2" data-testid={`infra-slot-${slot}`}>
                <span className="w-24 text-sm font-medium">
                  {slot === 'before' ? TEXT.slotBefore : TEXT.slotAfter}
                </span>
                <PhotoPicker testIdPrefix={`infra-${slot}`} onFile={(f) => void onFile(slot, f)} compact />
                {integration?.renderPhotoSources?.(slot, (photo) => void onFile(slot, photo.file, photo.captureId))}
                {asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt=""
                    className="h-10 w-10 rounded border border-[var(--pf-border-default)] object-cover"
                    data-testid={`infra-thumb-${slot}`}
                  />
                ) : null}
              </div>
            );
          })}
          <div>
            <button
              type="button"
              disabled={!canStartTwo}
              data-testid="infra-two-start"
              onClick={() => setPhase('markBefore')}
              className={`${pickButtonPrimary} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {TEXT.start}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {overlay}
    </div>
  );
}
