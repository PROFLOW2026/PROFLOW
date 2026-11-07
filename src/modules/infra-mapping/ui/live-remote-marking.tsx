'use client';

/**
 * Marking from the watching phone: the touch interaction (place / drag a point with a fixed magnifier and a fine
 * drag), the numbered points drawn over the picture, and the bar of actions. Everything is expressed in
 * PICTURE coordinates (0..1), so the viewer's zoom, crop and screen size can never move a point.
 */

import {
  Crosshair,
  Eye,
  Lock,
  LockOpen,
  Rotate3d,
  Smartphone,
  Snowflake,
  SlidersHorizontal,
  Undo2,
  RefreshCcw,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { FINE_DRAG_GAIN, type LoupePlacement } from '@/modules/project-workspace/domain/infra-overlay-geometry';
import {
  BarButton,
  BarHintContext,
  FineTuneTray,
  OVERLAY_TEXT,
} from '@/modules/project-workspace/ui/infra-overlay-controls';
import {
  MovableLoupe,
  PIN_HIT_RADIUS_PX,
  PinMark,
  RegionLoupe,
} from '@/modules/project-workspace/ui/infra-overlay-pins';
import { LIVE_CONTROL, type NormalizedPoint, type RemoteState } from '../domain/live-control';
import type { ViewerCommandNoSync } from './live-remote-client';
import { LIVE_SHARE_TEXT } from './live-share-texts';
import {
  clientToImage,
  containedRect,
  dragPoint,
  nearestPoint,
  type ViewTransform,
} from './live-share-view';

/* -------------------------------------------------------------------------- */
/* Touch interaction                                                            */
/* -------------------------------------------------------------------------- */

interface MarkingParams {
  /** Mark mode is on and the broadcaster allows changing points right now. */
  readonly enabled: boolean;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly viewRef: RefObject<ViewTransform>;
  /** Width / height of the broadcast picture. */
  readonly aspect: number;
  /** The points as they are shown now (the draft while editing, otherwise the broadcaster's). */
  readonly pins: readonly NormalizedPoint[];
  readonly onChange: (pins: NormalizedPoint[], final: boolean) => void;
}

interface PinDragState {
  readonly pointerId: number;
  readonly index: number;
  readonly finger: { readonly x: number; readonly y: number };
  readonly start: NormalizedPoint;
  working: NormalizedPoint[];
}

export interface LoupeView {
  readonly surfaceW: number;
  readonly surfaceH: number;
  readonly point: NormalizedPoint;
  /** How wide the picture is on screen (zoom included): keeps the magnification steady. */
  readonly screenWidth: number;
}

/**
 * One finger on the picture places the next point exactly where it lands, or picks up the nearest existing point;
 * from then on the point follows the finger at half speed (fine adjustment). The magnifier sits in a fixed spot
 * chosen when the touch begins. Nothing is ever placed outside the picture.
 */
export function useRemoteMarking(params: MarkingParams) {
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });
  const drag = useRef<PinDragState | null>(null);
  const [loupe, setLoupe] = useState<LoupeView | null>(null);
  /** Where the user moved the magnifier frame; kept for the whole marking session. */
  const [loupePlacement, setLoupePlacement] = useState<LoupePlacement | null>(null);
  const [tick, setTick] = useState(0);

  const pinning = loupe !== null;
  useEffect(() => {
    if (!pinning) return undefined;
    document.body.dataset.infraPinning = '1';
    const timer = window.setInterval(() => setTick((value) => value + 1), 120);
    return () => {
      window.clearInterval(timer);
      delete document.body.dataset.infraPinning;
    };
  }, [pinning]);

  function geometry() {
    const { stageRef, viewRef, aspect } = latest.current;
    const stage = stageRef.current;
    if (!stage) return null;
    const box = stage.getBoundingClientRect();
    return { stage, box, dims: { w: box.width, h: box.height }, view: viewRef.current, aspect };
  }

  /** Returns true when the touch was taken by the marking (so the caller must not pan / zoom with it). */
  function begin(event: ReactPointerEvent<HTMLElement>): boolean {
    const { enabled, pins, onChange } = latest.current;
    const geo = geometry();
    if (!enabled || !geo) return false;
    const finger = { x: event.clientX - geo.box.left, y: event.clientY - geo.box.top };

    let index = nearestPoint(pins, finger, geo.dims, geo.view, geo.aspect, PIN_HIT_RADIUS_PX);
    let working = pins.map((pin) => ({ ...pin }));
    let start: NormalizedPoint;
    if (index >= 0) {
      start = working[index]!;
    } else {
      if (pins.length >= LIVE_CONTROL.maxPins) return false;
      const placed = clientToImage(finger, geo.dims, geo.view, geo.aspect);
      if (!placed) return false; // a black margin or outside the picture: nothing to mark
      index = pins.length;
      start = placed;
      working = [...working, placed];
      onChange(working, false);
    }

    drag.current = { pointerId: event.pointerId, index, finger, start, working };
    const rect = containedRect(geo.dims.w, geo.dims.h, geo.aspect);
    setLoupe({
      surfaceW: geo.dims.w,
      surfaceH: geo.dims.h,
      point: start,
      screenWidth: rect.width * geo.view.scale,
    });
    return true;
  }

  function move(event: ReactPointerEvent<HTMLElement>): boolean {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return false;
    const geo = geometry();
    if (!geo) return true;
    const delta = {
      x: event.clientX - geo.box.left - current.finger.x,
      y: event.clientY - geo.box.top - current.finger.y,
    };
    const next = dragPoint(current.start, delta, geo.dims, geo.view, geo.aspect, FINE_DRAG_GAIN);
    current.working = current.working.map((pin, i) => (i === current.index ? next : pin));
    latest.current.onChange(current.working, false);
    setLoupe((value) => (value ? { ...value, point: next } : value));
    return true;
  }

  /** The finger lifted (or a second finger arrived): the point stays where it is and is sent for good. */
  function end(event: ReactPointerEvent<HTMLElement> | null): boolean {
    const current = drag.current;
    if (!current || (event && current.pointerId !== event.pointerId)) return false;
    drag.current = null;
    latest.current.onChange(current.working, true);
    setLoupe(null);
    return true;
  }

  return { begin, move, end, loupe, loupePlacement, setLoupePlacement, tick, pinning, isDragging: () => drag.current !== null };
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                      */
/* -------------------------------------------------------------------------- */

/** The numbered points, inside a layer that follows the same zoom and pan as the picture. */
export function RemotePinLayer({
  pins,
  box,
  view,
  aspect,
  nextIndex,
}: {
  readonly pins: readonly NormalizedPoint[];
  readonly box: { readonly w: number; readonly h: number };
  readonly view: ViewTransform;
  readonly aspect: number;
  readonly nextIndex: number;
}) {
  const rect = containedRect(box.w, box.h, aspect);
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ transformOrigin: 'center', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      data-testid="live-remote-pins"
    >
      <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
        {pins.map((pin, index) => (
          <div
            key={index}
            className="absolute size-0"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: `scale(${1 / view.scale})` }}
            data-testid={`live-remote-pin-${index + 1}`}
            data-x={pin.x.toFixed(4)}
            data-y={pin.y.toFixed(4)}
          >
            <PinMark x={0} y={0} label={index + 1} highlighted={index === nextIndex} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The viewer's magnifier: the same movable frame as everywhere else (top centre unless the user moved it). */
export function RemoteLoupe({
  loupe,
  video,
  tick,
  placement,
  onPlacementChange,
}: {
  readonly loupe: LoupeView;
  readonly video: HTMLVideoElement | null;
  readonly tick: number;
  readonly placement: LoupePlacement | null;
  readonly onPlacementChange: (next: LoupePlacement | null) => void;
}) {
  return (
    <MovableLoupe surfaceW={loupe.surfaceW} surfaceH={loupe.surfaceH} placement={placement} onPlacementChange={onPlacementChange}>
      <RegionLoupe video={video} point={loupe.point} screenWidth={loupe.screenWidth} frameTick={tick} />
    </MovableLoupe>
  );
}

/* -------------------------------------------------------------------------- */
/* Bar of actions                                                               */
/* -------------------------------------------------------------------------- */

const OPACITY_SEND_MS = 80;

export function RemoteControlBar({
  state,
  markMode,
  onMarkMode,
  pinCount,
  maxPins,
  onCommand,
  onUndoPoint,
  onRelease,
  tuneOpen,
  onTuneOpen,
  hint,
  onHint,
}: {
  readonly state: RemoteState;
  readonly markMode: boolean;
  readonly onMarkMode: (on: boolean) => void;
  readonly pinCount: number;
  readonly maxPins: number;
  readonly onCommand: (command: ViewerCommandNoSync) => void;
  readonly onUndoPoint: () => void;
  readonly onRelease: () => void;
  readonly tuneOpen: boolean;
  readonly onTuneOpen: (open: boolean) => void;
  readonly hint: string | null;
  readonly onHint: (message: string) => void;
}) {
  const [opacity, setOpacity] = useState<number | null>(null);
  const lastSent = useRef(0);
  const shownOpacity = opacity ?? state.opacity;
  const iconClass = 'size-5';

  function changeOpacity(value: number) {
    setOpacity(value);
    const now = Date.now();
    if (now - lastSent.current >= OPACITY_SEND_MS) {
      lastSent.current = now;
      onCommand({ t: 'opacity', value });
    }
  }
  function commitOpacity(value: number) {
    onCommand({ t: 'opacity', value });
    setOpacity(null);
  }

  const locked = state.locked;
  const complete = pinCount >= maxPins;
  const status = locked
    ? LIVE_SHARE_TEXT.viewerLockedHint
    : markMode
      ? complete
        ? LIVE_SHARE_TEXT.viewerAllPlaced
        : LIVE_SHARE_TEXT.viewerNextPoint(pinCount + 1)
      : LIVE_SHARE_TEXT.viewerModeViewLong;

  return (
    <BarHintContext.Provider value={onHint}>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-10 flex flex-col items-center gap-1 px-2 [body[data-infra-pinning]_&]:opacity-60"
        data-testid="live-remote-bar"
        dir="rtl"
      >
        {hint ? (
          <div
            className="pointer-events-none w-fit max-w-full rounded bg-black/75 px-2 py-1 text-center text-[11px] text-white"
            role="status"
            data-testid="live-remote-hint"
          >
            {hint}
          </div>
        ) : null}
        {tuneOpen && state.aligned && !locked ? (
          <div className="pointer-events-auto max-w-full">
            <FineTuneTray
              disabled={locked}
              canUndo={state.canUndoAdjust}
              canReset={state.canResetAdjust}
              onBegin={() => undefined}
              onNudge={(direction) => onCommand({ t: 'nudge', dir: direction })}
              onUndo={() => onCommand({ t: 'adjustUndo' })}
              onReset={() => onCommand({ t: 'adjustReset' })}
            />
          </div>
        ) : null}
        <div className="pointer-events-auto flex max-w-full flex-col gap-0.5 rounded-3xl bg-black/65 px-1.5 py-1 backdrop-blur">
          <p className="px-2 text-center text-[11px] text-white/85" role="status" data-testid="live-remote-status">
            {status}
          </p>
          <label className="flex items-center gap-2 px-2 text-[11px] text-white/80">
            <span className="shrink-0">{LIVE_SHARE_TEXT.viewerOpacity}</span>
            <input
              type="range"
              min={LIVE_CONTROL.minOpacity}
              max={LIVE_CONTROL.maxOpacity}
              step={0.05}
              value={shownOpacity}
              onChange={(event) => changeOpacity(Number(event.target.value))}
              onPointerUp={(event) => commitOpacity(Number(event.currentTarget.value))}
              onKeyUp={(event) => commitOpacity(Number(event.currentTarget.value))}
              className="h-6 min-w-0 flex-1 accent-cyan-400"
              aria-label={LIVE_SHARE_TEXT.viewerOpacity}
              data-testid="live-remote-opacity"
            />
          </label>
          <div className="flex flex-wrap items-center justify-center gap-0.5" role="group" aria-label={LIVE_SHARE_TEXT.viewerModeGroup}>
            <BarButton
              icon={<Eye className={iconClass} />}
              label={LIVE_SHARE_TEXT.viewerModeView}
              description={LIVE_SHARE_TEXT.viewerModeViewLong}
              active={!markMode}
              onClick={() => onMarkMode(false)}
              testId="live-remote-mode-view"
            />
            <BarButton
              icon={<Crosshair className={iconClass} />}
              label={LIVE_SHARE_TEXT.viewerModeMark}
              description={LIVE_SHARE_TEXT.viewerModeMarkLong}
              active={markMode}
              onClick={() => onMarkMode(true)}
              testId="live-remote-mode-mark"
            />
            <BarButton
              icon={<Undo2 className={iconClass} />}
              label={LIVE_SHARE_TEXT.viewerUndoPoint}
              description={LIVE_SHARE_TEXT.viewerUndoPointLong}
              unavailable={locked ? LIVE_SHARE_TEXT.viewerLockedHint : pinCount === 0 ? LIVE_SHARE_TEXT.viewerNeedPoints : null}
              onClick={onUndoPoint}
              testId="live-remote-undo-point"
            />
            <BarButton
              icon={<RefreshCcw className={iconClass} />}
              label={OVERLAY_TEXT.realignShort}
              description={OVERLAY_TEXT.realign}
              unavailable={pinCount === 0 ? LIVE_SHARE_TEXT.viewerNeedPoints : null}
              onClick={() => onCommand({ t: 'realign' })}
              testId="live-remote-realign"
            />
            <BarButton
              icon={<Snowflake className={iconClass} />}
              label={state.frozen ? OVERLAY_TEXT.unfreezeShort : OVERLAY_TEXT.freezeShort}
              description={state.frozen ? OVERLAY_TEXT.unfreeze : OVERLAY_TEXT.freeze}
              active={state.frozen}
              onClick={() => onCommand({ t: 'freeze', on: !state.frozen })}
              testId="live-remote-freeze"
            />
            <BarButton
              icon={<Rotate3d className={iconClass} />}
              label={OVERLAY_TEXT.perspective}
              description={OVERLAY_TEXT.perspectiveLong}
              active={state.perspective}
              unavailable={state.canPerspective ? null : LIVE_SHARE_TEXT.viewerNeedPerspective}
              onClick={() => onCommand({ t: 'perspective', on: !state.perspective })}
              testId="live-remote-perspective"
            />
            <BarButton
              icon={<SlidersHorizontal className={iconClass} />}
              label={OVERLAY_TEXT.fineTuneShort}
              description={OVERLAY_TEXT.fineTune}
              active={tuneOpen && state.aligned && !locked}
              unavailable={!state.aligned ? LIVE_SHARE_TEXT.viewerNeedPoints : locked ? LIVE_SHARE_TEXT.viewerNeedUnlocked : null}
              onClick={() => onTuneOpen(!tuneOpen)}
              testId="live-remote-fine-tune"
            />
            <BarButton
              icon={locked ? <Lock className={iconClass} /> : <LockOpen className={iconClass} />}
              label={locked ? OVERLAY_TEXT.unlockShort : OVERLAY_TEXT.lockShort}
              description={locked ? OVERLAY_TEXT.unlock : OVERLAY_TEXT.lock}
              active={locked}
              unavailable={!state.aligned ? LIVE_SHARE_TEXT.viewerNeedPoints : null}
              onClick={() => onCommand({ t: 'lock', on: !locked })}
              testId="live-remote-lock"
            />
            <BarButton
              icon={<Smartphone className={iconClass} />}
              label={LIVE_SHARE_TEXT.viewerRelease}
              description={LIVE_SHARE_TEXT.viewerReleaseLong}
              onClick={onRelease}
              testId="live-remote-release"
            />
          </div>
          <p className="px-2 pb-0.5 text-center text-[10px] leading-3 text-amber-200/90">{LIVE_SHARE_TEXT.visualOnly}</p>
        </div>
      </div>
    </BarHintContext.Provider>
  );
}
