'use client';

/**
 * Compact controls of the locating screens: the action bar, fine-tune tray, fit-status chip, instant view
 * switch, blink button and the split divider. Everything is small and see-through so the camera / wall stays visible.
 */

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Minus,
  MoveHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  X,
  Zap,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  IDENTITY,
  multiplyMat3,
  nudgeAdjust,
  type AlignmentQuality,
  type Mat3,
  type NudgeStep,
} from '../domain/infra-overlay-geometry';
import type { InfraRemoteNudge } from './infra-trial-integration';

export const OVERLAY_TEXT = {
  back: 'חזרה',
  opacity: 'שקיפות',
  realign: 'איפוס יישור וסימון מחדש של 4 הנקודות',
  realignShort: 'סימון מחדש',
  perspective: 'פרספקטיבה',
  perspectiveLong: 'התאמת פרספקטיבה (במקום התאמה ישרה)',
  save: 'שמירת תוצאת הניסוי',
  saveShort: 'שמירה',
  lock: 'נעילת היישור',
  lockShort: 'נעילה',
  unlock: 'שחרור הנעילה',
  unlockShort: 'נעול',
  freeze: 'הקפאת פריים',
  freezeShort: 'הקפאה',
  unfreeze: 'חזרה לתצוגה חיה',
  unfreezeShort: 'חזרה לחי',
  fineTune: 'כוונון עדין של השכבה',
  fineTuneShort: 'כוונון',
  share: 'שיתוף שידור לטלפון נוסף',
  shareShort: 'שיתוף',
  needPoints: 'צריך לסמן 4 נקודות',
  needPerspective: 'פרספקטיבה דורשת לפחות 3 נקודות',
  needUnlocked: 'היישור נעול – שחררו את הנעילה',
  editPoints: 'תיקון נקודות',
  moveUp: 'הזזה למעלה',
  moveDown: 'הזזה למטה',
  moveLeft: 'הזזה שמאלה',
  moveRight: 'הזזה ימינה',
  rotateLeft: 'סיבוב נגד כיוון השעון',
  rotateRight: 'סיבוב עם כיוון השעון',
  smaller: 'הקטנת השכבה',
  larger: 'הגדלת השכבה',
  undoNudge: 'חזרה',
  undoNudgeLong: 'חזרה לשינוי הקודם בכוונון',
  resetNudge: 'איפוס כוונון',
  resetNudgeLong: 'איפוס כל תיקוני הכוונון (הנקודות נשארות)',
  qualityGood: 'התאמה תקינה',
  qualityNeedsFix: 'דורשת תיקון',
  qualityFailed: 'נכשלה',
  viewBefore: 'לפני',
  viewAfter: 'אחרי',
  viewOverlay: 'משולב',
  viewSplit: 'חצי',
  viewGroup: 'מצב תצוגה',
  blink: 'הבהוב בין התמונות (לחיצה להפעלה, החזקה להצגה זמנית)',
  blinkShort: 'הבהוב',
  editPointsShort: 'נקודות',
  viewModeShort: 'תצוגה',
  moveLayerShort: 'הזזה',
  zoomViewShort: 'זום',
  splitHandle: 'פס השוואה',
} as const;

export const barButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-40';
const activeButtonClass = 'bg-cyan-500/90 hover:bg-cyan-400';
const trayButtonClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-35';

/* -------------------------------------------------------------------------- */
/* Manual correction with an undo trail                                         */
/* -------------------------------------------------------------------------- */

const MAX_HISTORY = 40;

/**
 * The user's manual correction of the aligned layer, plus the trail that lets them return to the previous
 * position or to zero. Every change keeps the position before it, so nothing is ever lost by a stray touch.
 */
export function useAdjustHistory() {
  const [adjust, setAdjust] = useState<Mat3>(IDENTITY);
  const [depth, setDepth] = useState(0);
  const current = useRef<Mat3>(IDENTITY);
  const trail = useRef<Mat3[]>([]);

  const write = useCallback((next: Mat3) => {
    current.current = next;
    setAdjust(next);
  }, []);

  /** Remembers the position before a change (call once per gesture / button press, not per frame). */
  const begin = useCallback(() => {
    trail.current.push(current.current);
    if (trail.current.length > MAX_HISTORY) trail.current.shift();
    setDepth(trail.current.length);
  }, []);

  const apply = useCallback(
    (incremental: Mat3) => write(multiplyMat3(incremental, current.current)),
    [write],
  );

  const nudge = useCallback(
    (step: NudgeStep, stageW: number, stageH: number) => write(nudgeAdjust(current.current, step, stageW, stageH)),
    [write],
  );

  const undo = useCallback(() => {
    const previous = trail.current.pop();
    setDepth(trail.current.length);
    if (previous) write(previous);
  }, [write]);

  const reset = useCallback(() => {
    if (current.current.every((value, index) => value === IDENTITY[index])) return;
    begin();
    write(IDENTITY);
  }, [begin, write]);

  /** Forgets the correction and its trail (new points, other stage shape, new alignment). */
  const clear = useCallback(() => {
    trail.current = [];
    setDepth(0);
    write(IDENTITY);
  }, [write]);

  /** Sets a stored correction without leaving a trail (reopening a saved result). */
  const restore = useCallback(
    (next: Mat3) => {
      trail.current = [];
      setDepth(0);
      write(next);
    },
    [write],
  );

  return { adjust, canUndo: depth > 0, begin, apply, nudge, undo, reset, clear, restore } as const;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                      */
/* -------------------------------------------------------------------------- */

/** Fires once on press, then repeats while held (small, controlled nudges). */
function RepeatButton({
  onStart,
  onStep,
  disabled,
  label,
  children,
}: {
  readonly onStart: () => void;
  readonly onStep: () => void;
  readonly disabled?: boolean;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const delay = useRef<number | null>(null);
  const repeat = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (delay.current !== null) window.clearTimeout(delay.current);
    if (repeat.current !== null) window.clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  return (
    <button
      type="button"
      className={trayButtonClass}
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        stop();
        onStart();
        onStep();
        delay.current = window.setTimeout(() => {
          repeat.current = window.setInterval(onStep, 80);
        }, 350);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStart();
          onStep();
        }
      }}
    >
      {children}
    </button>
  );
}

const NUDGE_PX = 2;
const NUDGE_ROTATION = (0.25 * Math.PI) / 180;
const NUDGE_SCALE = 1.005;

/** The small steps of the fine-tune controls, by name (the second phone sends only the name, never a size). */
export const NUDGE_STEPS: Record<InfraRemoteNudge, NudgeStep> = {
  left: { dx: -NUDGE_PX },
  right: { dx: NUDGE_PX },
  up: { dy: -NUDGE_PX },
  down: { dy: NUDGE_PX },
  rotateLeft: { rotation: -NUDGE_ROTATION },
  rotateRight: { rotation: NUDGE_ROTATION },
  smaller: { scale: 1 / NUDGE_SCALE },
  larger: { scale: NUDGE_SCALE },
};

/** Small, controlled corrections of the aligned layer, with "previous position" and "reset". */
export function FineTuneTray({
  disabled,
  canUndo,
  canReset,
  onBegin,
  onNudge,
  onUndo,
  onReset,
}: {
  readonly disabled: boolean;
  readonly canUndo: boolean;
  readonly canReset: boolean;
  readonly onBegin: () => void;
  readonly onNudge: (direction: InfraRemoteNudge) => void;
  readonly onUndo: () => void;
  readonly onReset: () => void;
}) {
  const separator = <span className="mx-0.5 h-5 w-px bg-white/25" aria-hidden />;
  const move = (label: string, direction: InfraRemoteNudge, icon: ReactNode) => (
    <RepeatButton label={label} disabled={disabled} onStart={onBegin} onStep={() => onNudge(direction)}>
      {icon}
    </RepeatButton>
  );
  return (
    <div
      className="flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl bg-black/65 px-1.5 py-1 backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="infra-fine-tune"
      dir="rtl"
    >
      <div className="flex items-center gap-0.5" dir="ltr">
        {move(OVERLAY_TEXT.moveLeft, 'left', <ChevronLeft className="size-5" />)}
        {move(OVERLAY_TEXT.moveUp, 'up', <ChevronUp className="size-5" />)}
        {move(OVERLAY_TEXT.moveDown, 'down', <ChevronDown className="size-5" />)}
        {move(OVERLAY_TEXT.moveRight, 'right', <ChevronRight className="size-5" />)}
      </div>
      {separator}
      <div className="flex items-center gap-0.5" dir="ltr">
        {move(OVERLAY_TEXT.rotateLeft, 'rotateLeft', <RotateCcw className="size-4" />)}
        {move(OVERLAY_TEXT.rotateRight, 'rotateRight', <RotateCw className="size-4" />)}
      </div>
      {separator}
      <div className="flex items-center gap-0.5" dir="ltr">
        {move(OVERLAY_TEXT.smaller, 'smaller', <Minus className="size-4" />)}
        {move(OVERLAY_TEXT.larger, 'larger', <Plus className="size-4" />)}
      </div>
      {separator}
      <button
        type="button"
        className="min-h-8 rounded-full px-2.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-35"
        onClick={onUndo}
        disabled={disabled || !canUndo}
        title={OVERLAY_TEXT.undoNudgeLong}
        aria-label={OVERLAY_TEXT.undoNudgeLong}
        data-testid="infra-nudge-undo"
      >
        {OVERLAY_TEXT.undoNudge}
      </button>
      <button
        type="button"
        className="min-h-8 rounded-full px-2.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-35"
        onClick={onReset}
        disabled={disabled || !canReset}
        title={OVERLAY_TEXT.resetNudgeLong}
        aria-label={OVERLAY_TEXT.resetNudgeLong}
        data-testid="infra-nudge-reset"
      >
        {OVERLAY_TEXT.resetNudge}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                       */
/* -------------------------------------------------------------------------- */

const QUALITY_VIEW: Record<AlignmentQuality, { text: string; dot: string }> = {
  good: { text: OVERLAY_TEXT.qualityGood, dot: 'bg-emerald-400' },
  needsFix: { text: OVERLAY_TEXT.qualityNeedsFix, dot: 'bg-amber-400' },
  failed: { text: OVERLAY_TEXT.qualityFailed, dot: 'bg-red-500' },
};

/**
 * Plain fit status. It says how consistent the 4 points are with each other - never a distance in centimetres,
 * because nothing here is calibrated to the real wall.
 */
export function QualityChip({
  quality,
  prefix,
  className,
}: {
  readonly quality: AlignmentQuality;
  readonly prefix?: string | null;
  readonly className?: string;
}) {
  const view = QUALITY_VIEW[quality];
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${className ?? ''}`} dir="rtl">
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur"
        role="status"
        data-testid="infra-quality"
        data-quality={quality}
      >
        <span className={`size-2 rounded-full ${view.dot}`} aria-hidden />
        {prefix ? <span className="text-white/75">{prefix} ·</span> : null}
        {view.text}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Two-photo view controls                                                      */
/* -------------------------------------------------------------------------- */

export type CompareDisplay = 'overlay' | 'before' | 'after' | 'split';

const DISPLAY_ITEMS: readonly { readonly mode: CompareDisplay; readonly label: string }[] = [
  { mode: 'before', label: OVERLAY_TEXT.viewBefore },
  { mode: 'after', label: OVERLAY_TEXT.viewAfter },
  { mode: 'overlay', label: OVERLAY_TEXT.viewOverlay },
  { mode: 'split', label: OVERLAY_TEXT.viewSplit },
];

/** Instant switch between before only / after only / combined layer / half-and-half. Never touches alignment or zoom. */
export function ViewModeBar({
  mode,
  onMode,
  className,
}: {
  readonly mode: CompareDisplay;
  readonly onMode: (mode: CompareDisplay) => void;
  readonly className?: string;
}) {
  return (
    <div
      className={`absolute inset-x-0 flex justify-center px-2 ${className ?? ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-0.5 rounded-full bg-black/60 p-0.5 backdrop-blur"
        role="group"
        aria-label={OVERLAY_TEXT.viewGroup}
        data-testid="infra-view-switch"
        dir="rtl"
      >
        {DISPLAY_ITEMS.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={`min-h-8 rounded-full px-3 text-xs font-medium text-white transition-colors ${
              mode === item.mode ? 'bg-cyan-500/90' : 'hover:bg-white/15'
            }`}
            aria-pressed={mode === item.mode}
            onClick={() => onMode(item.mode)}
            data-testid={`infra-view-${item.mode}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const HOLD_MS = 250;

/**
 * Blink between the two photos: a quick tap starts / stops automatic blinking, holding the button shows the
 * other photo for as long as it is held.
 */
export function BlinkButton({
  active,
  onToggle,
  onHold,
  disabled,
}: {
  readonly active: boolean;
  readonly onToggle: () => void;
  readonly onHold: (holding: boolean) => void;
  readonly disabled?: boolean;
}) {
  const timer = useRef<number | null>(null);
  const holding = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const release = (toggleIfTap: boolean) => {
    const wasHolding = holding.current;
    clear();
    holding.current = false;
    if (wasHolding) onHold(false);
    else if (toggleIfTap) onToggle();
  };
  return (
    <button
      type="button"
      className={`${labeledButtonClass} ${active ? activeButtonClass : ''} ${disabled ? 'opacity-45' : ''}`}
      disabled={disabled}
      aria-pressed={active}
      aria-label={OVERLAY_TEXT.blink}
      title={OVERLAY_TEXT.blink}
      data-testid="infra-blink"
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        clear();
        timer.current = window.setTimeout(() => {
          holding.current = true;
          onHold(true);
        }, HOLD_MS);
      }}
      onPointerUp={() => release(true)}
      onPointerCancel={() => release(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Zap className="size-5" />
      <span className="max-w-14 truncate text-[10px] leading-3 text-white/90">{OVERLAY_TEXT.blinkShort}</span>
    </button>
  );
}

/** Draggable vertical divider for the half-and-half view (before on the left, after on the right). */
export function SplitDivider({
  position,
  onPosition,
  beforeLabel,
  afterLabel,
}: {
  readonly position: number;
  readonly onPosition: (value: number) => void;
  readonly beforeLabel: string;
  readonly afterLabel: string;
}) {
  const dragging = useRef(false);
  const update = (e: ReactPointerEvent<HTMLDivElement>) => {
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0) return;
    onPosition(Math.min(0.96, Math.max(0.04, (e.clientX - rect.left) / rect.width)));
  };
  return (
    <div
      className="absolute inset-y-0 z-10 w-11 -translate-x-1/2 cursor-col-resize"
      style={{ left: `${position * 100}%`, touchAction: 'none' }}
      role="separator"
      aria-orientation="vertical"
      aria-label={OVERLAY_TEXT.splitHandle}
      data-testid="infra-split-divider"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        update(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) update(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
      <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg">
        <MoveHorizontal className="size-5" />
      </span>
      <span
        className="absolute end-[calc(50%+1.5rem)] top-1/2 -translate-y-1/2 rounded bg-black/65 px-1.5 text-[11px] leading-4 text-white"
        dir="rtl"
      >
        {beforeLabel}
      </span>
      <span
        className="absolute start-[calc(50%+1.5rem)] top-1/2 -translate-y-1/2 rounded bg-black/65 px-1.5 text-[11px] leading-4 text-white"
        dir="rtl"
      >
        {afterLabel}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Action bar                                                                   */
/* -------------------------------------------------------------------------- */

export { activeButtonClass };

/* -------------------------------------------------------------------------- */
/* Labelled bar buttons                                                          */
/* -------------------------------------------------------------------------- */

export const BarHintContext = createContext<((message: string) => void) | null>(null);

const labeledButtonClass =
  'inline-flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pb-0.5 pt-1 text-white transition-colors hover:bg-white/15 active:bg-white/25';

/**
 * One action of the bar: an icon with a one-word label under it (so no icon has to be guessed), a clearly
 * highlighted active state, a spinner while it works, and - when it cannot be used right now - a tap that says why
 * instead of doing nothing.
 */
export function BarButton({
  icon,
  label,
  description,
  onClick,
  active,
  busy,
  unavailable,
  tone,
  testId,
}: {
  readonly icon: ReactNode;
  /** One short word under the icon. */
  readonly label: string;
  /** The full name (tooltip and screen readers). Defaults to the label. */
  readonly description?: string;
  readonly onClick: () => void;
  /** For toggles: whether it is on. Leave undefined for plain actions. */
  readonly active?: boolean;
  readonly busy?: boolean;
  /** Why it cannot be used right now (shown when tapped). */
  readonly unavailable?: string | null;
  readonly tone?: 'primary';
  readonly testId?: string;
}) {
  const hint = useContext(BarHintContext);
  const blocked = Boolean(unavailable);
  const full = description ?? label;
  return (
    <button
      type="button"
      className={`${labeledButtonClass} ${active ? activeButtonClass : ''} ${
        tone === 'primary' && !blocked && !active ? 'bg-cyan-500/90 hover:bg-cyan-400' : ''
      } ${blocked ? 'opacity-45' : ''}`}
      onClick={() => {
        if (busy) return;
        if (unavailable) hint?.(unavailable);
        else onClick();
      }}
      aria-pressed={active}
      aria-disabled={blocked || busy ? true : undefined}
      aria-busy={busy ? true : undefined}
      aria-label={unavailable ? `${full} – ${unavailable}` : full}
      title={unavailable ?? full}
      data-testid={testId}
      data-active={active ? 'true' : undefined}
    >
      {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      <span className="max-w-14 truncate text-[10px] leading-3 text-white/90">{label}</span>
    </button>
  );
}

/**
 * The one bar of actions: opacity on top, labelled buttons below (wrapping, never a horizontal scroll). A short
 * notice and the fine-tune tray stack just above it. `compact` (tripod mode) keeps only the critical actions.
 */
export function OverlayBar({
  opacity,
  onOpacity,
  onBack,
  onRealign,
  realignIcon,
  realignUnavailable,
  perspective,
  perspectiveUnavailable,
  onTogglePerspective,
  perspectiveIcon,
  extra,
  onSave,
  saveUnavailable,
  saving,
  tray,
  notice,
  compact,
}: {
  readonly opacity: number;
  readonly onOpacity: (v: number) => void;
  readonly onBack: () => void;
  readonly onRealign: () => void;
  readonly realignIcon: ReactNode;
  readonly realignUnavailable?: string | null;
  readonly perspective: boolean;
  readonly perspectiveUnavailable?: string | null;
  readonly onTogglePerspective: () => void;
  readonly perspectiveIcon: ReactNode;
  readonly extra?: ReactNode;
  readonly onSave: () => void;
  readonly saveUnavailable?: string | null;
  readonly saving?: boolean;
  readonly tray?: ReactNode;
  readonly notice?: ReactNode;
  readonly compact?: boolean;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const showHint = useCallback((message: string) => {
    setHint(message);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2600);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    },
    [],
  );

  return (
    <BarHintContext.Provider value={showHint}>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-1 px-2"
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="infra-overlay-bar"
        data-compact={compact ? 'true' : undefined}
      >
        {hint ? (
          <div
            className="pointer-events-none w-fit max-w-full rounded bg-black/75 px-2 py-1 text-center text-[11px] text-white"
            dir="rtl"
            role="status"
            data-testid="infra-bar-hint"
          >
            {hint}
          </div>
        ) : null}
        {notice}
        {tray ? <div className="pointer-events-auto max-w-full">{tray}</div> : null}
        <div className="pointer-events-auto flex max-w-full flex-col gap-0.5 rounded-3xl bg-black/60 px-1.5 py-1 backdrop-blur">
          {compact ? null : (
            <label className="flex items-center gap-2 px-2 text-[11px] text-white/80" dir="rtl">
              <span className="shrink-0">{OVERLAY_TEXT.opacity}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => onOpacity(Number(e.target.value))}
                aria-label={OVERLAY_TEXT.opacity}
                className="h-6 min-w-0 flex-1 accent-cyan-400"
              />
              <span className="w-9 shrink-0 text-end tabular-nums" dir="ltr">
                {Math.round(opacity * 100)}%
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-stretch justify-center gap-0.5" dir="rtl">
            <BarButton icon={<X className="size-5" />} label={OVERLAY_TEXT.back} onClick={onBack} testId="infra-bar-back" />
            {compact ? null : (
              <>
                <BarButton
                  icon={realignIcon}
                  label={OVERLAY_TEXT.realignShort}
                  description={OVERLAY_TEXT.realign}
                  onClick={onRealign}
                  unavailable={realignUnavailable}
                  testId="infra-realign"
                />
                <BarButton
                  icon={perspectiveIcon}
                  label={OVERLAY_TEXT.perspective}
                  description={OVERLAY_TEXT.perspectiveLong}
                  onClick={onTogglePerspective}
                  active={perspective}
                  unavailable={perspectiveUnavailable}
                  testId="infra-perspective"
                />
              </>
            )}
            {extra}
            {compact ? null : (
              <BarButton
                icon={saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" />}
                label={OVERLAY_TEXT.saveShort}
                description={OVERLAY_TEXT.save}
                onClick={onSave}
                busy={saving}
                unavailable={saveUnavailable}
                tone="primary"
                testId="infra-overlay-save"
              />
            )}
          </div>
        </div>
      </div>
    </BarHintContext.Provider>
  );
}
