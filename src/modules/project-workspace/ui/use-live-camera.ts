'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The live camera of the infrastructure overlay, owned by one hook so the picture can never silently stop:
 *
 * - The stream lives here, not inside a `<video>`. Whenever a `<video>` element appears (first mount, or
 *   re-created because the layout re-measured), the stream is bound to it again. A new element that never
 *   received the stream was the way the picture ended up frozen.
 * - Freezing is the only thing that may pause the picture, and leaving it is verified: a frame must really
 *   advance, otherwise the stream is re-bound, then the camera is re-opened, and only then is the failure
 *   shown (with a manual retry).
 * - While live, a watchdog notices a picture that stopped moving (a paused element, an ended or stalled
 *   track, a page that came back from the background) and restarts it.
 */

/** `failed`: no camera could be opened. `stalled`: it opened, but live frames did not come back. */
export type LiveCameraState = 'starting' | 'live' | 'failed' | 'stalled';

const WATCHDOG_MS = 1000;
/** Ticks without a new frame before the stream is re-bound. */
const STALL_TICKS = 3;
/** How long a resume may take before it counts as failed. */
const RESUME_WAIT_MS = 1600;

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function openStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  } catch (error) {
    // A device that rejects the preferred shape still gets its camera.
    if (error instanceof DOMException && (error.name === 'OverconstrainedError' || error.name === 'NotReadableError')) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
    throw error;
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Plain callbacks (no refs): safe to use while rendering. */
export interface LiveCameraControls {
  /** Pass as the `<video ref>`: binds the stream to whichever element is mounted. */
  readonly attach: (element: HTMLVideoElement | null) => void;
  /** Pauses the picture on its current frame (an explicit, temporary choice). */
  readonly freeze: () => void;
  /** Leaves the frozen frame and proves that new frames arrive. Resolves false when it could not. */
  readonly resume: () => Promise<boolean>;
  /** Manual retry after a failure: opens the camera again. */
  readonly retry: () => void;
}

export interface LiveCameraRefs {
  /** The current `<video>` element (read by the loupe, the broadcast and the saved picture). */
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  /** Settings of the active camera track (kept for the saved report). */
  readonly settings: RefObject<MediaTrackSettings>;
}

/** `[state, controls, refs]`. */
export function useLiveCamera(): readonly [
  LiveCameraState,
  LiveCameraControls['attach'],
  LiveCameraControls['freeze'],
  LiveCameraControls['resume'],
  LiveCameraControls['retry'],
  LiveCameraRefs,
] {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settings = useRef<MediaTrackSettings>({});
  const frozenRef = useRef(false);
  const aliveRef = useRef(true);
  const openingRef = useRef<Promise<boolean> | null>(null);
  const [state, setState] = useState<LiveCameraState>('starting');

  const bind = useCallback((element: HTMLVideoElement, stream: MediaStream) => {
    if (element.srcObject !== stream) element.srcObject = stream;
    element.muted = true;
    void element.play().catch(() => undefined);
  }, []);

  /** Opens the camera (replacing any old stream) and binds it to the current element. */
  const open = useCallback((): Promise<boolean> => {
    if (openingRef.current) return openingRef.current;
    const run = (async () => {
      try {
        const stream = await openStream();
        if (!aliveRef.current) {
          stopStream(stream);
          return false;
        }
        const previous = streamRef.current;
        streamRef.current = stream;
        stopStream(previous);
        settings.current = stream.getVideoTracks()[0]?.getSettings() ?? {};
        const element = videoRef.current;
        if (element) bind(element, stream);
        if (!frozenRef.current) setState('live');
        return true;
      } catch {
        if (aliveRef.current) setState('failed');
        return false;
      } finally {
        openingRef.current = null;
      }
    })();
    openingRef.current = run;
    return run;
  }, [bind]);

  useEffect(() => {
    aliveRef.current = true;
    void open();
    return () => {
      aliveRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open]);

  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      const stream = streamRef.current;
      if (element && stream && !frozenRef.current) bind(element, stream);
    },
    [bind],
  );

  /** True once the picture has really advanced (a new frame, not just a "playing" flag). */
  const advances = useCallback(async (element: HTMLVideoElement, within: number): Promise<boolean> => {
    const start = element.currentTime;
    const end = performance.now() + within;
    while (performance.now() < end) {
      await wait(120);
      if (!aliveRef.current || videoRef.current !== element) return false;
      if (!element.paused && element.readyState >= 2 && element.currentTime !== start) return true;
    }
    return false;
  }, []);

  const trackLive = useCallback((): boolean => {
    const track = streamRef.current?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live');
  }, []);

  const freeze = useCallback(() => {
    frozenRef.current = true;
    videoRef.current?.pause();
  }, []);

  const resume = useCallback(async (): Promise<boolean> => {
    frozenRef.current = false;
    // Step 1: just play. Step 2: bind the stream again. Step 3: open the camera again.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!aliveRef.current) return false;
      if (attempt === 2 || !trackLive()) {
        if (!(await open())) return false;
      } else {
        const element = videoRef.current;
        const stream = streamRef.current;
        if (element && stream) {
          if (attempt === 1) element.srcObject = null;
          bind(element, stream);
        }
      }
      const element = videoRef.current;
      if (element && (await advances(element, RESUME_WAIT_MS))) {
        setState('live');
        return true;
      }
    }
    if (aliveRef.current) setState('stalled');
    return false;
  }, [advances, bind, open, trackLive]);

  const retry = useCallback(() => {
    frozenRef.current = false;
    setState('starting');
    void resume();
  }, [resume]);

  // Watchdog while live: nothing but a freeze may leave the picture still.
  useEffect(() => {
    let lastTime = -1;
    let stalled = 0;
    let rebinds = 0;
    const timer = window.setInterval(() => {
      if (!aliveRef.current || frozenRef.current || openingRef.current) return;
      if (document.visibilityState === 'hidden') return;
      const element = videoRef.current;
      const stream = streamRef.current;
      if (!element || !stream) return;
      if (!trackLive()) {
        void open();
        return;
      }
      if (element.srcObject !== stream) {
        bind(element, stream);
        return;
      }
      if (element.paused) {
        void element.play().catch(() => undefined);
        return;
      }
      if (element.currentTime !== lastTime) {
        lastTime = element.currentTime;
        stalled = 0;
        rebinds = 0;
        return;
      }
      stalled += 1;
      if (stalled < STALL_TICKS) return;
      stalled = 0;
      rebinds += 1;
      if (rebinds > 2) {
        rebinds = 0;
        void open();
      } else {
        element.srcObject = null;
        bind(element, stream);
      }
    }, WATCHDOG_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || frozenRef.current) return;
      const element = videoRef.current;
      const stream = streamRef.current;
      if (!element || !stream) return;
      if (!trackLive()) void open();
      else bind(element, stream);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [bind, open, trackLive]);

  return [state, attach, freeze, resume, retry, { videoRef, settings }] as const;
}
