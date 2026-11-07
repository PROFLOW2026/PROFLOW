'use client';

/**
 * Infrastructure locating: overlay a "before the wall was closed" photo on the live camera, or compare it
 * with an "after" photo, from 4 hand-marked reference points.
 *
 * Everything stays in the browser. Nothing is uploaded or stored unless the workspace integration is present
 * AND the user explicitly confirms the save sheet. The alignment is a visual aid only - it is never an
 * engineering measurement and must not be used to decide where to drill.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  Crosshair,
  ImageUp,
  Images,
  LockOpen,
  Loader2,
  Lock,
  MapPin,
  Move,
  Rotate3d,
  Snowflake,
  SlidersHorizontal,
  Undo2,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  IDENTITY,
  REQUIRED_LANDMARKS,
  applyMat3,
  classifyAlignment,
  computeStageAlignment,
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
import {
  BarButton,
  BlinkButton,
  FineTuneTray,
  NUDGE_STEPS,
  OVERLAY_TEXT,
  OverlayBar,
  QualityChip,
  SplitDivider,
  ViewModeBar,
  barButtonClass,
  useAdjustHistory,
  type CompareDisplay,
} from './infra-overlay-controls';
import {
  ImageLoupe,
  PinSurface,
  ReferenceThumb,
  VideoLoupe,
  clamp01,
  type GestureParts,
} from './infra-overlay-pins';
import { drawThroughMatrix, drawVideoCover } from './infra-overlay-render';
import { InfraSaveSheet } from './infra-save-sheet';
import { useLiveCamera } from './use-live-camera';
import type {
  InfraLiveComposition,
  InfraLiveRemote,
  InfraLiveShareSource,
  InfraRemoteCommand,
  InfraRemoteState,
  InfraTrialAlignment,
  InfraTrialIntegration,
  InfraTrialSaveInput,
} from './infra-trial-integration';

const MAX_PHOTO_SIDE = 1600;
/** A pin is placed exactly where the finger touches (no offset). */
const MAX_PINS = REQUIRED_LANDMARKS;

const TEXT = {
  title: 'זיהוי תשתיות',
  introLive:
    'ניסוי: בוחרים תמונה מלפני סגירת הקיר, מסמנים 4 נקודות זיהוי, ואז מציגים אותה שקופה מעל המצלמה החיה. שום דבר לא נשמר או נשלח.',
  introTwo:
    'ניסוי: בוחרים תמונת לפני סגירה ותמונת אחרי סגירה, מסמנים בשתיהן אותן 4 נקודות, ומשווים בעזרת שקיפות. שום דבר לא נשמר או נשלח.',
  introLiveSaved:
    'בוחרים תמונה מלפני סגירת הקיר, מסמנים 4 נקודות זיהוי ומציגים אותה שקופה מעל המצלמה החיה. שום דבר לא נשמר אלא אם תבחרו לשמור. היישור הוא עזר חזותי בלבד ואינו מדידה הנדסית.',
  introTwoSaved:
    'בוחרים תמונת לפני ותמונת אחרי, מסמנים בשתיהן אותן 4 נקודות ומשווים. שום דבר לא נשמר אלא אם תבחרו לשמור. היישור הוא עזר חזותי בלבד ואינו מדידה הנדסית.',
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
  capture: 'צילום תמונה',
  choose: 'בחירת תמונה',
  loadError: 'לא ניתן לקרוא את התמונה',
  loadingPhoto: 'טוען תמונה…',
  markHint: 'סמנו 4 נקודות קבועות על הקיר',
  editHint: 'גררו נקודה לתיקון',
  referenceLabel: 'תמונת המקור',
  alignFailed: 'ההתאמה נכשלה. גררו נקודה לתיקון או סמנו מחדש.',
  next: 'המשך',
  back: 'חזרה',
  undo: 'ביטול נקודה אחרונה',
  save: 'שמירת תוצאת הניסוי',
  copied: 'התוצאה הועתקה',
  close: 'סגירה',
  copy: 'העתקה',
  cameraError: 'אין גישה למצלמה',
  cameraResumeError: 'המצלמה לא חזרה לשידור חי',
  cameraRetry: 'נסו שוב',
  perspectiveRejected: 'פרספקטיבה לא סבירה – נשארה התאמה ישרה',
  moveLayer: 'התאמת השכבה',
  zoomView: 'הגדלת תצוגה',
  pointsBefore: 'נקודות לפני',
  pointsAfter: 'נקודות אחרי',
  frozen: 'קפוא',
  switchToTwo: 'השוואה עם תמונת אחרי',
  switchToLive: 'מעבר למצלמה חיה',
  alreadySaved: 'התוצאה הזו כבר שמורה',
  movedNotice: 'חזרנו לתצוגה חיה. אם הטלפון זז – סמנו מחדש.',
} as const;

function pointLabel(n: number): string {
  return `נקודה ${Math.min(Math.max(n, 1), MAX_PINS)}/${MAX_PINS}`;
}

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
  ctx.scale(k, k);
  drawVideoCover(ctx, video, stageW, stageH);
  return canvas;
}

/**
 * Overlay snapshot in stage coordinates: backdrop first, then the transparent "before" layer drawn through
 * the very same matrix (perspective included) as on screen and in the broadcast.
 */
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
  drawThroughMatrix(ctx, overlay, input.overlay.width, input.overlay.height, input.overlayMatrix, input.opacity);
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

function recordView(display: CompareDisplay): NonNullable<InfraTrialAlignment['view']> {
  return display === 'split' ? 'sideBySide' : display;
}

function displayFromRecord(view: InfraTrialAlignment['view'] | undefined): CompareDisplay {
  if (view === 'sideBySide') return 'split';
  if (view === 'after' || view === 'before') return view;
  return 'overlay';
}

/** A short line above the action bar; never covers the picture. */
function Notice({
  children,
  testId,
  action,
}: {
  readonly children: ReactNode;
  readonly testId?: string;
  /** An optional tap target inside the line (e.g. retrying the camera). */
  readonly action?: { readonly label: string; readonly onClick: () => void; readonly testId?: string };
}) {
  return (
    <div
      className="pointer-events-none flex w-fit max-w-full items-center gap-2 rounded bg-black/70 px-2 py-1 text-center text-[11px] text-white"
      dir="rtl"
      role="status"
      data-testid={testId}
    >
      <span>{children}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="pointer-events-auto min-h-8 rounded bg-white/90 px-2.5 text-[11px] font-medium text-black"
          data-testid={action.testId}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stand-alone result sheet (only when there is no workspace integration)       */
/* -------------------------------------------------------------------------- */

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

/** The old photo drawn through the alignment matrix (stage pixels). */
function OverlayImage({
  photo,
  matrix,
  opacity,
  testId = 'infra-overlay-layer',
}: {
  readonly photo: PhotoAsset;
  readonly matrix: Mat3;
  readonly opacity: number;
  readonly testId?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
      data-testid={testId}
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
  /** The other photo + its landmarks, shown while marking the same points here. */
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
  const toSurface = useMemo<Mat3>(
    () => [w / photo.width, 0, 0, 0, h / photo.height, 0, 0, 0, 1],
    [w, h, photo.width, photo.height],
  );
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
        <span className="line-clamp-1 min-w-0 flex-1 px-1 text-center text-xs text-white/80">{hint}</span>
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
          <PinSurface
            width={w}
            height={h}
            pins={pins}
            maxPins={MAX_PINS}
            onPinsChange={onPinsChange}
            highlightIndex={pins.length < MAX_PINS ? pins.length : undefined}
            renderLoupe={(center) => <ImageLoupe photo={photo} toSurface={toSurface} center={center} />}
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
        {reference ? (
          <ReferenceThumb
            photo={reference.photo}
            pins={reference.pins}
            nextIndex={pins.length < MAX_PINS ? pins.length : -1}
            label={pins.length < MAX_PINS ? pointLabel(pins.length + 1) : TEXT.referenceLabel}
          />
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
  // The camera lives in one hook: the stream outlives any `<video>` element and is re-bound to whichever is mounted.
  const [cameraState, attachCamera, freezeCamera, resumeCamera, retryCamera, { videoRef, settings: trackSettings }] =
    useLiveCamera();
  const cameraFailed = cameraState === 'failed' || cameraState === 'stalled';
  const [livePins, setLivePins] = useState<Pt[]>([]);
  const adj = useAdjustHistory();
  const [opacity, setOpacity] = useState(0.55);
  const [perspective, setPerspective] = useState(false);
  const [locked, setLocked] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  /** Tripod mode (set by the share control): a compact bar, so the phone standing alone hides little of the wall. */
  const [tripod, setTripod] = useState(false);
  /** Changes whenever the picture shape changes or the points are cleared: remote commands made for an older one are dropped. */
  const [epoch, setEpoch] = useState(0);
  /** Shown after leaving a frozen frame: the camera may have moved, and a frozen fit does not follow it. */
  const [movedNotice, setMovedNotice] = useState(false);
  const saved = useSavedResult();

  // Rotating the phone changes the stage shape: old taps no longer match the scene.
  const orientation = size.w >= size.h ? 'landscape' : 'portrait';
  const lastOrientation = useRef<string | null>(null);
  const { clear: clearSaved } = saved;
  const { clear: clearAdjust } = adj;
  useEffect(() => {
    if (size.w === 0) return;
    if (lastOrientation.current && lastOrientation.current !== orientation) {
      setLivePins([]);
      clearAdjust();
      setLocked(false);
      setTuneOpen(false);
      setMovedNotice(false);
      setEpoch((value) => value + 1);
      clearSaved();
    }
    lastOrientation.current = orientation;
  }, [orientation, size.w, clearSaved, clearAdjust]);

  useEffect(() => {
    if (!movedNotice) return undefined;
    const timer = window.setTimeout(() => setMovedNotice(false), 9000);
    return () => window.clearTimeout(timer);
  }, [movedNotice]);

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

  const matrix = alignment ? multiplyMat3(adj.adjust, alignment.fit.matrix) : null;

  // What a broadcast needs, read fresh on every frame (so alignment / opacity changes are streamed live).
  // The matrix is the same full (perspective) one the screen uses.
  const composition = useRef<InfraLiveComposition | null>(null);
  useLayoutEffect(() => {
    const video = videoRef.current;
    composition.current =
      video && size.w > 0
        ? {
            video,
            stageW: size.w,
            stageH: size.h,
            overlay: matrix ? { url: photo.url, width: photo.width, height: photo.height } : null,
            matrix,
            opacity,
          }
        : null;
  });
  const changePins = useCallback(
    (next: Pt[]) => {
      setLivePins(next);
      setMovedNotice(false);
      clearAdjust();
    },
    [clearAdjust],
  );

  function realign() {
    setLivePins([]);
    clearAdjust();
    setLocked(false);
    setTuneOpen(false);
    setMovedNotice(false);
    setEpoch((value) => value + 1);
    clearSaved();
  }

  /** Freezing is deliberate and temporary; leaving it proves that new frames arrive (or reports it). */
  function freezeTo(on: boolean) {
    if (on === frozen) return;
    if (on) {
      if (!videoRef.current) return;
      freezeCamera();
      setFrozen(true);
    } else {
      setFrozen(false);
      // A fit made on a frozen frame says nothing about where the camera is now.
      if (alignment) setMovedNotice(true);
      void resumeCamera();
    }
  }

  function toggleFreeze() {
    freezeTo(!frozen);
  }

  function lockTo(on: boolean) {
    if (on && !alignment) return;
    setLocked(on);
    setTuneOpen(false);
  }

  function toggleLock() {
    lockTo(!locked);
  }

  /* ---- The second phone (remote marking): the same actions, by name, applied to this screen ---- */
  const remoteState = useMemo<InfraRemoteState | null>(
    () =>
      size.w > 0
        ? {
            aligned: Boolean(alignment),
            pins: livePins.map((pin) => ({ x: clamp01(pin.x), y: clamp01(pin.y) })),
            refPins: photoPins.map((pin) => ({ x: clamp01(pin.x), y: clamp01(pin.y) })),
            opacity,
            perspective,
            canPerspective: photoPins.length >= 3 && livePins.length >= 3,
            locked,
            frozen,
            quality: livePins.length >= photoPins.length ? classifyAlignment(alignment) : null,
            canUndoAdjust: adj.canUndo,
            canResetAdjust: adj.canUndo || !isIdentityAdjust(adj.adjust),
            stage: { w: Math.round(size.w), h: Math.round(size.h) },
            epoch,
          }
        : null,
    [alignment, livePins, photoPins, opacity, perspective, locked, frozen, adj.canUndo, adj.adjust, size.w, size.h, epoch],
  );

  function applyRemote(command: InfraRemoteCommand) {
    if (size.w <= 0) return;
    switch (command.t) {
      case 'pins':
        // A locked fit is never changed from afar; the points are limited to the number the source photo has.
        if (locked) return;
        changePins(command.pins.slice(0, photoPins.length).map((pin) => ({ x: clamp01(pin.x), y: clamp01(pin.y) })));
        return;
      case 'nudge':
        if (locked || !alignment) return;
        // A held button arrives as a burst of steps: remember the position before the burst once.
        if (Date.now() - lastRemoteNudge.current > 400) adj.begin();
        lastRemoteNudge.current = Date.now();
        adj.nudge(NUDGE_STEPS[command.dir], size.w, size.h);
        return;
      case 'adjustUndo':
        if (!locked) adj.undo();
        return;
      case 'adjustReset':
        if (!locked) adj.reset();
        return;
      case 'opacity':
        setOpacity(Math.min(1, Math.max(0.1, command.value)));
        return;
      case 'perspective':
        setPerspective(command.on);
        return;
      case 'lock':
        lockTo(command.on);
        return;
      case 'freeze':
        freezeTo(command.on);
        return;
      case 'realign':
        realign();
        return;
    }
  }

  const lastRemoteNudge = useRef(0);
  const remoteListeners = useRef(new Set<() => void>());
  const remoteLatest = useRef<{
    state: InfraRemoteState | null;
    apply: (command: InfraRemoteCommand) => void;
    setTripod: (on: boolean) => void;
  }>({ state: null, apply: () => undefined, setTripod: () => undefined });
  useLayoutEffect(() => {
    remoteLatest.current = { state: remoteState, apply: applyRemote, setTripod: (on) => setTripod(on) };
  });
  useEffect(() => {
    remoteListeners.current.forEach((listener) => listener());
  }, [remoteState, tripod]);
  const referenceRef = useRef<{ url: string; width: number; height: number } | null>(null);
  const [liveShareSource] = useState<InfraLiveShareSource>(() => {
    const remote: InfraLiveRemote = {
      getState: () => remoteLatest.current.state,
      subscribe: (listener) => {
        remoteListeners.current.add(listener);
        return () => {
          remoteListeners.current.delete(listener);
        };
      },
      apply: (command) => remoteLatest.current.apply(command),
      getReference: () => referenceRef.current,
      setTripod: (on) => remoteLatest.current.setTripod(on),
    };
    return { getComposition: () => composition.current, remote };
  });
  useLayoutEffect(() => {
    referenceRef.current = { url: photo.url, width: photo.width, height: photo.height };
  }, [photo.url, photo.width, photo.height]);

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
        adjust: isIdentityAdjust(adj.adjust) ? null : matrixToAdjust(adj.adjust),
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
      manualAdjustment: adj.adjust.map((v) => Number(v.toFixed(2))),
      opacity: Number(opacity.toFixed(2)),
      camera: trackSettings.current,
      userAgent: navigator.userAgent,
    });
  }

  const complete = livePins.length >= photoPins.length;
  const canPerspective = photoPins.length >= 3 && livePins.length >= 3;
  const topClass = 'top-[max(0.5rem,env(safe-area-inset-top))]';

  const notice =
    complete && !alignment ? (
      <Notice testId="infra-align-failed">{TEXT.alignFailed}</Notice>
    ) : perspective && alignment?.perspectiveRejected ? (
      <Notice>{TEXT.perspectiveRejected}</Notice>
    ) : cameraFailed ? (
      <Notice testId="infra-camera-failed" action={{ label: TEXT.cameraRetry, onClick: retryCamera, testId: 'infra-camera-retry' }}>
        {cameraState === 'stalled' ? TEXT.cameraResumeError : TEXT.cameraError}
      </Notice>
    ) : movedNotice ? (
      <Notice testId="infra-moved-notice">{TEXT.movedNotice}</Notice>
    ) : null;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-black" dir="ltr">
      {size.w > 0 ? (
        <PinSurface
          width={size.w}
          height={size.h}
          pins={livePins}
          maxPins={photoPins.length}
          onPinsChange={changePins}
          onAdjust={(incremental) => adj.apply(incremental)}
          onGestureStart={adj.begin}
          locked={locked}
          highlightIndex={livePins.length < photoPins.length ? livePins.length : undefined}
          renderLoupe={(center) => <VideoLoupe videoRef={videoRef} stageW={size.w} stageH={size.h} center={center} />}
        >
          <video
            ref={attachCamera}
            autoPlay
            playsInline
            muted
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          {matrix ? <OverlayImage photo={photo} matrix={matrix} opacity={opacity} /> : null}
        </PinSurface>
      ) : null}

      {complete && alignment ? null : (
        <ReferenceThumb
          photo={photo}
          pins={photoPins}
          nextIndex={complete ? -1 : livePins.length}
          label={complete ? TEXT.referenceLabel : pointLabel(livePins.length + 1)}
        />
      )}

      {complete ? (
        <QualityChip
          quality={classifyAlignment(alignment)}
          prefix={frozen ? TEXT.frozen : null}
          className={topClass}
        />
      ) : frozen ? (
        <div
          className={`pointer-events-none absolute inset-x-0 ${topClass} flex justify-center [body[data-infra-pinning]_&]:invisible`}
          dir="rtl"
        >
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur">{TEXT.frozen}</span>
        </div>
      ) : null}

      <OverlayBar
        opacity={opacity}
        onOpacity={setOpacity}
        onBack={onBack}
        onRealign={realign}
        realignIcon={<Crosshair className="size-5" />}
        realignUnavailable={livePins.length === 0 ? OVERLAY_TEXT.needPoints : null}
        perspective={perspective}
        perspectiveUnavailable={canPerspective ? null : OVERLAY_TEXT.needPerspective}
        onTogglePerspective={() => setPerspective((v) => !v)}
        perspectiveIcon={<Rotate3d className="size-5" />}
        notice={notice}
        compact={tripod}
        tray={
          tuneOpen && alignment && !locked && !tripod ? (
            <FineTuneTray
              disabled={locked}
              canUndo={adj.canUndo}
              canReset={adj.canUndo || !isIdentityAdjust(adj.adjust)}
              onBegin={adj.begin}
              onNudge={(direction) => adj.nudge(NUDGE_STEPS[direction], size.w, size.h)}
              onUndo={adj.undo}
              onReset={adj.reset}
            />
          ) : null
        }
        extra={
          <>
            <BarButton
              icon={<Snowflake className="size-5" />}
              label={frozen ? OVERLAY_TEXT.unfreezeShort : OVERLAY_TEXT.freezeShort}
              description={frozen ? OVERLAY_TEXT.unfreeze : OVERLAY_TEXT.freeze}
              active={frozen}
              onClick={toggleFreeze}
              testId="infra-freeze"
            />
            {tripod ? null : (
              <BarButton
                icon={<SlidersHorizontal className="size-5" />}
                label={OVERLAY_TEXT.fineTuneShort}
                description={OVERLAY_TEXT.fineTune}
                active={tuneOpen && !locked}
                unavailable={!alignment ? OVERLAY_TEXT.needPoints : locked ? OVERLAY_TEXT.needUnlocked : null}
                onClick={() => setTuneOpen((v) => !v)}
                testId="infra-fine-tune-toggle"
              />
            )}
            <BarButton
              icon={locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
              label={locked ? OVERLAY_TEXT.unlockShort : OVERLAY_TEXT.lockShort}
              description={locked ? OVERLAY_TEXT.unlock : OVERLAY_TEXT.lock}
              active={locked}
              unavailable={!alignment ? OVERLAY_TEXT.needPoints : null}
              onClick={toggleLock}
              testId="infra-lock"
            />
            {integration?.renderLiveShare?.(liveShareSource)}
          </>
        }
        onSave={save}
        saveUnavailable={!alignment ? OVERLAY_TEXT.needPoints : null}
        saving={preparing}
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
const BLINK_MS = 600;

function matrixScale(m: Mat3): number {
  return Math.hypot(m[0], m[3]);
}

type PointsTray = 'none' | 'fine' | 'points';

function CompareStep({
  projectId,
  before,
  beforePins,
  after,
  afterPins,
  onBeforePinsChange,
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
  /** Lets the user fix the "before" points right here, without starting over. */
  readonly onBeforePinsChange: (pins: Pt[]) => void;
  /** Lets the user fix the "after" points right here, without starting over. */
  readonly onAfterPinsChange: (pins: Pt[]) => void;
  readonly onBack: () => void;
  readonly onRealign: () => void;
  readonly integration?: InfraTrialIntegration;
  /** A saved result being reopened: restores the stored adjustment / opacity / fit kind / view. */
  readonly initial?: InfraTrialAlignment | null;
}) {
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const [saveRequest, setSaveRequest] = useState<{ input: InfraTrialSaveInput; previewUrl: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const adj = useAdjustHistory();
  const [view, setView] = useState<Mat3>(IDENTITY);
  const [viewMode, setViewMode] = useState<'layer' | 'view'>('layer');
  const [opacity, setOpacity] = useState(0.55);
  const [perspective, setPerspective] = useState(false);
  const [display, setDisplay] = useState<CompareDisplay>(() => displayFromRecord(initial?.view));
  const [split, setSplit] = useState(0.5);
  const [blink, setBlink] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(false);
  const [hold, setHold] = useState(false);
  const [locked, setLocked] = useState(false);
  const [tray, setTray] = useState<PointsTray>('none');
  const [editing, setEditing] = useState<Slot | null>(null);
  const editSnapshot = useRef<{ before: Pt[]; after: Pt[] } | null>(null);
  const saved = useSavedResult();
  const { clear: clearSaved } = saved;
  const { clear: clearAdjust, restore: restoreAdjust, apply: applyAdjust } = adj;

  // "after" photo (its own pixels) -> stage pixels, aspect ratio preserved.
  const base = useMemo(
    () => (size.w > 0 ? fitContain(after.width, after.height, size.w, size.h) : IDENTITY),
    [after.width, after.height, size.w, size.h],
  );

  // A different stage shape invalidates manual tweaks and zoom (the display mode, split and opacity survive).
  const stageKey = `${Math.round(size.w)}x${Math.round(size.h)}`;
  const lastStage = useRef<string | null>(null);
  useEffect(() => {
    if (size.w === 0) return;
    if (lastStage.current && lastStage.current !== stageKey) {
      clearAdjust();
      setView(IDENTITY);
      clearSaved();
    }
    lastStage.current = stageKey;
  }, [stageKey, size.w, clearSaved, clearAdjust]);

  // Reopening a saved result: restore its manual adjustment (scaled to this stage), opacity, fit kind and view.
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (!initial || appliedInitial.current || size.w === 0) return;
    appliedInitial.current = true;
    if (initial.adjust) {
      const sx = initial.stage.w > 0 ? size.w / initial.stage.w : 1;
      const sy = initial.stage.h > 0 ? size.h / initial.stage.h : 1;
      restoreAdjust(
        userAdjustMatrix({ x: 0, y: 0 }, { ...initial.adjust, tx: initial.adjust.tx * sx, ty: initial.adjust.ty * sy }),
      );
    }
    setOpacity(initial.opacity);
    setPerspective(initial.kind === 'perspective');
    setDisplay(displayFromRecord(initial.view));
  }, [initial, size.w, size.h, restoreAdjust]);

  // Automatic blinking between the two photos.
  useEffect(() => {
    if (!blink) return undefined;
    const timer = window.setInterval(() => setBlinkPhase((phase) => !phase), BLINK_MS);
    return () => window.clearInterval(timer);
  }, [blink]);

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

  const matrix = alignment ? multiplyMat3(adj.adjust, alignment.fit.matrix) : null;
  const quality = classifyAlignment(alignment);

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
        if (locked) return;
        // Gesture coordinates are screen pixels; the layer lives under the view transform.
        applyAdjust(multiplyMat3(invertMat3(view), multiplyMat3(incremental, view)));
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
    [view, viewMode, locked, applyAdjust],
  );

  // What is on screen right now. The mode itself, the alignment, the zoom and the split position never change
  // by switching: only which layer is visible does (so switching is instant, nothing reloads).
  const hasLayer = Boolean(matrix);
  let shown: CompareDisplay = hasLayer ? display : 'after';
  if (hasLayer) {
    if (blink) shown = blinkPhase ? 'before' : 'after';
    else if (hold) shown = display === 'before' ? 'after' : 'before';
  }
  const temporaryShown = hasLayer && (blink || hold);

  function toggleBlink() {
    setBlink((value) => !value);
    setBlinkPhase(false);
  }

  function startEdit(slot: Slot) {
    editSnapshot.current = { before: [...beforePins], after: [...afterPins] };
    setTray('none');
    setEditing(slot);
  }

  function cancelEdit() {
    const snapshot = editSnapshot.current;
    if (snapshot) {
      onBeforePinsChange(snapshot.before);
      onAfterPinsChange(snapshot.after);
    }
    setEditing(null);
  }

  function confirmEdit() {
    const snapshot = editSnapshot.current;
    const same = (a: readonly Pt[], b: readonly Pt[]) =>
      a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y);
    // The manual correction is relative to the fit: new points mean a new fit, so it starts from zero.
    if (snapshot && (!same(snapshot.before, beforePins) || !same(snapshot.after, afterPins))) clearAdjust();
    setEditing(null);
  }

  function toggleLock() {
    setLocked((value) => !value);
    setTray('none');
  }

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
          ctx.transform(base[0], base[3], base[1], base[4], base[2], base[5]);
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
        adjust: isIdentityAdjust(adj.adjust) ? null : matrixToAdjust(adj.adjust),
        stage: { w: Math.round(size.w), h: Math.round(size.h) },
        opacity: round4(opacity),
        view: recordView(display),
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
      manualAdjustment: adj.adjust.map((v) => Number(v.toFixed(2))),
      view: view.map((v) => Number(v.toFixed(2))),
      opacity: Number(opacity.toFixed(2)),
      userAgent: navigator.userAgent,
    });
  }

  const topClass = 'top-[max(0.5rem,env(safe-area-inset-top))]';
  const layerView = (children: ReactNode) => (
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
      {children}
    </div>
  );

  const notice =
    perspective && alignment?.perspectiveRejected ? (
      <Notice>{TEXT.perspectiveRejected}</Notice>
    ) : alignFailed ? (
      <Notice testId="infra-align-failed">{TEXT.alignFailed}</Notice>
    ) : null;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden bg-neutral-900"
      dir="ltr"
      data-testid="infra-compare"
      data-display={shown}
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
          onGestureStart={() => {
            if (viewMode === 'layer' && !locked) adj.begin();
          }}
          renderLoupe={(center) => <ImageLoupe photo={after} toSurface={pinsToStage} center={center} />}
        >
          {layerView(
            <>
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
                  opacity: shown === 'before' ? 0 : 1,
                }}
              />
              {matrix ? (
                <OverlayImage
                  photo={before}
                  matrix={matrix}
                  opacity={shown === 'overlay' ? opacity : shown === 'before' ? 1 : 0}
                />
              ) : null}
            </>,
          )}
          {matrix ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                clipPath: `inset(0 ${(1 - split) * 100}% 0 0)`,
                visibility: shown === 'split' ? 'visible' : 'hidden',
              }}
            >
              {layerView(<OverlayImage photo={before} matrix={matrix} opacity={1} testId="infra-split-before" />)}
            </div>
          ) : null}
        </PinSurface>
      ) : null}

      {matrix && shown === 'split' ? (
        <SplitDivider
          position={split}
          onPosition={setSplit}
          beforeLabel={OVERLAY_TEXT.viewBefore}
          afterLabel={OVERLAY_TEXT.viewAfter}
        />
      ) : null}

      {matrix ? (
        <ViewModeBar mode={display} onMode={setDisplay} className={topClass} />
      ) : null}

      {afterPins.length >= MAX_PINS ? (
        <QualityChip
          quality={quality}
          prefix={temporaryShown ? (shown === 'before' ? OVERLAY_TEXT.viewBefore : OVERLAY_TEXT.viewAfter) : null}
          className={matrix ? 'top-[calc(max(0.5rem,env(safe-area-inset-top))+2.5rem)]' : topClass}
        />
      ) : null}

      {alignFailed ? (
        <ReferenceThumb photo={before} pins={beforePins} nextIndex={-1} label={TEXT.referenceLabel} />
      ) : null}

      <OverlayBar
        opacity={opacity}
        onOpacity={setOpacity}
        onBack={onBack}
        onRealign={onRealign}
        realignIcon={<Crosshair className="size-5" />}
        perspective={perspective}
        perspectiveUnavailable={!alignment ? OVERLAY_TEXT.needPoints : null}
        onTogglePerspective={() => setPerspective((v) => !v)}
        perspectiveIcon={<Rotate3d className="size-5" />}
        notice={notice}
        tray={
          tray === 'fine' && alignment && !locked ? (
            <FineTuneTray
              disabled={locked}
              canUndo={adj.canUndo}
              canReset={adj.canUndo || !isIdentityAdjust(adj.adjust)}
              onBegin={adj.begin}
              onNudge={(direction) => adj.nudge(NUDGE_STEPS[direction], size.w, size.h)}
              onUndo={adj.undo}
              onReset={adj.reset}
            />
          ) : tray === 'points' ? (
            <div
              className="flex items-center gap-1 rounded-full bg-black/65 p-0.5 backdrop-blur"
              onPointerDown={(e) => e.stopPropagation()}
              dir="rtl"
              data-testid="infra-points-tray"
            >
              {(['before', 'after'] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="min-h-8 rounded-full px-3 text-xs font-medium text-white hover:bg-white/15"
                  onClick={() => startEdit(slot)}
                  data-testid={`infra-edit-points-${slot}`}
                >
                  {slot === 'before' ? TEXT.pointsBefore : TEXT.pointsAfter}
                </button>
              ))}
            </div>
          ) : null
        }
        extra={
          <>
            <BarButton
              icon={viewMode === 'view' ? <ZoomIn className="size-5" /> : <Move className="size-5" />}
              label={viewMode === 'view' ? OVERLAY_TEXT.zoomViewShort : OVERLAY_TEXT.moveLayerShort}
              description={viewMode === 'view' ? TEXT.zoomView : TEXT.moveLayer}
              active={viewMode === 'view'}
              onClick={() => setViewMode((m) => (m === 'layer' ? 'view' : 'layer'))}
              testId="infra-view-mode"
            />
            <BlinkButton active={blink} onToggle={toggleBlink} onHold={setHold} disabled={!matrix} />
            <BarButton
              icon={<SlidersHorizontal className="size-5" />}
              label={OVERLAY_TEXT.fineTuneShort}
              description={OVERLAY_TEXT.fineTune}
              active={tray === 'fine' && !locked}
              unavailable={!alignment ? OVERLAY_TEXT.needPoints : locked ? OVERLAY_TEXT.needUnlocked : null}
              onClick={() => setTray((t) => (t === 'fine' ? 'none' : 'fine'))}
              testId="infra-fine-tune-toggle"
            />
            <BarButton
              icon={locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
              label={locked ? OVERLAY_TEXT.unlockShort : OVERLAY_TEXT.lockShort}
              description={locked ? OVERLAY_TEXT.unlock : OVERLAY_TEXT.lock}
              active={locked}
              unavailable={!alignment ? OVERLAY_TEXT.needPoints : null}
              onClick={toggleLock}
              testId="infra-lock"
            />
            <BarButton
              icon={<MapPin className="size-5" />}
              label={OVERLAY_TEXT.editPointsShort}
              description={OVERLAY_TEXT.editPoints}
              active={tray === 'points'}
              onClick={() => setTray((t) => (t === 'points' ? 'none' : 'points'))}
              testId="infra-edit-points"
            />
          </>
        }
        onSave={save}
        saveUnavailable={!alignment ? OVERLAY_TEXT.needPoints : initial ? TEXT.alreadySaved : null}
        saving={preparing}
      />

      {editing ? (
        <div className="absolute inset-0 z-20 bg-neutral-900" data-testid="infra-edit-points-step">
          <MarkStep
            photo={editing === 'before' ? before : after}
            pins={editing === 'before' ? beforePins : afterPins}
            hint={TEXT.editHint}
            reference={
              editing === 'before'
                ? { photo: after, pins: afterPins }
                : { photo: before, pins: beforePins }
            }
            onPinsChange={editing === 'before' ? onBeforePinsChange : onAfterPinsChange}
            onBack={cancelEdit}
            onNext={confirmEdit}
          />
        </div>
      ) : null}

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
  busy,
  captureLabel,
  chooseLabel,
}: {
  readonly testIdPrefix: string;
  readonly onFile: (file: File | undefined) => void;
  readonly compact?: boolean;
  readonly busy?: boolean;
  readonly captureLabel?: string;
  readonly chooseLabel?: string;
}) {
  const size = compact ? 'px-3 py-1.5' : '';
  const disabled = busy ? 'pointer-events-none opacity-60' : '';
  return (
    <>
      <label className={`${pickButtonPrimary} ${size} ${disabled}`}>
        <Camera className="size-4" />
        {captureLabel ?? TEXT.capture}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          data-testid={`${testIdPrefix}-capture`}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      <label className={`${pickButtonSecondary} ${size} ${disabled}`}>
        <ImageUp className="size-4" />
        {chooseLabel ?? TEXT.choose}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
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
  const [loadingPhoto, setLoadingPhoto] = useState(false);
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
    setLoadingPhoto(true);
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
    } finally {
      setLoadingPhoto(false);
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
        hint={TEXT.markAfterHint}
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
        onBeforePinsChange={setBeforePins}
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

  /** Moves to the other mode keeping only the chosen "before" photo (its points are marked again for the new flow). */
  function switchKeepingBefore(next: Mode) {
    setMode(next);
    setPhase('idle');
    setAfter(null);
    setBeforePins([]);
    setAfterPins([]);
    setReopened(null);
    setError(null);
  }

  const modeCardClass =
    'flex flex-1 flex-col items-start gap-1 rounded-lg border border-[var(--pf-border-default)] p-4 text-start hover:bg-[var(--pf-action-subtle-active)]';

  const loadingNotice = loadingPhoto ? (
    <p className="flex items-center gap-2 text-sm text-[var(--pf-text-secondary)]" role="status" data-testid="infra-photo-loading">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {TEXT.loadingPhoto}
    </p>
  ) : null;

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
              busy={loadingPhoto}
              onFile={(f) => void onFile('before', f)}
            />
            {integration?.renderPhotoSources?.('before', (photo) => void onFile('before', photo.file, photo.captureId))}
          </div>
          {integration?.renderRecentPhotos?.((photo) => void onFile('before', photo.file, photo.captureId))}
          {loadingNotice}
          {before ? (
            <div className="flex flex-wrap items-center gap-3">
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
              <button
                type="button"
                data-testid="infra-switch-to-two"
                onClick={() => switchKeepingBefore('two')}
                className={pickButtonSecondary}
              >
                {TEXT.switchToTwo}
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
              <div key={slot} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2" data-testid={`infra-slot-${slot}`}>
                  <span className="w-24 text-sm font-medium">
                    {slot === 'before' ? TEXT.slotBefore : TEXT.slotAfter}
                  </span>
                  <PhotoPicker
                    testIdPrefix={`infra-${slot}`}
                    onFile={(f) => void onFile(slot, f)}
                    busy={loadingPhoto}
                    compact
                  />
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
                {slot === 'before'
                  ? integration?.renderRecentPhotos?.((photo) => void onFile('before', photo.file, photo.captureId))
                  : null}
              </div>
            );
          })}
          {loadingNotice}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canStartTwo || loadingPhoto}
              data-testid="infra-two-start"
              onClick={() => setPhase('markBefore')}
              className={`${pickButtonPrimary} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {TEXT.start}
            </button>
            {before ? (
              <button
                type="button"
                data-testid="infra-switch-to-live"
                onClick={() => switchKeepingBefore('live')}
                className={pickButtonSecondary}
              >
                {TEXT.switchToLive}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {overlay}
    </div>
  );
}
