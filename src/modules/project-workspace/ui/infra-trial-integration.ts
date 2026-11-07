import type { ReactNode } from 'react';
import type { Mat3 } from '../domain/infra-overlay-geometry';

/**
 * Optional wiring between the locating experiment (`InfraOverlayTrial`) and the infrastructure
 * mapping workspace. Without it the experiment behaves exactly as before: nothing is stored.
 * With it, the user can pick photos from the project gallery / connected storage, and - only by an
 * explicit "save" choice - store the result in the organization's cloud.
 */

export type InfraTrialSlot = 'before' | 'after';

export interface InfraTrialPhoto {
  readonly file: File;
  /** Set when the photo came from the infrastructure gallery (already catalogued in the cloud). */
  readonly captureId?: string | null;
}

export interface InfraTrialLocation {
  readonly id: string;
  /** Full path label, e.g. "בניין א › קומה 3 › דירה 12". */
  readonly label: string;
}

export interface InfraTrialAlignment {
  readonly version: 1;
  readonly kind: 'similarity' | 'perspective';
  readonly beforePins: [number, number][];
  readonly afterPins: [number, number][];
  readonly adjust: { tx: number; ty: number; scale: number; rotation: number } | null;
  readonly stage: { w: number; h: number };
  readonly opacity: number;
  /** Comparison view the user was in: combined layer / split with a divider / after only / before only. */
  readonly view: 'overlay' | 'sideBySide' | 'after' | 'before' | null;
}

export interface InfraTrialSaveInput {
  readonly mode: 'two_photos' | 'live';
  readonly alignment: InfraTrialAlignment;
  readonly reliable: boolean;
  /** Catalogued "before" photo, when it came from the gallery. */
  readonly beforeCaptureId: string | null;
  readonly beforeFile: File | null;
  /** The "after" photo (second photo, or the live camera frame at the moment of saving). */
  readonly afterFile: File | null;
  /** The overlay snapshot (after + transparent before). */
  readonly resultFile: File | null;
}

export interface InfraTrialSaveOptions {
  readonly locationId: string;
  readonly note: string | null;
  readonly saveBefore: boolean;
  readonly saveAfter: boolean;
  readonly saveResult: boolean;
}

export type InfraTrialSaveOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface InfraTrialInitial {
  readonly beforeUrl: string;
  readonly afterUrl: string;
  readonly alignment: InfraTrialAlignment;
}

/** A photo picked elsewhere in the workspace (gallery dialog) and sent straight into a locating mode. */
export interface InfraTrialPreset {
  /** Changes on every pick so picking the same photo twice still applies. */
  readonly key: number;
  readonly target: 'two-before' | 'two-after' | 'live-before';
  readonly photo: InfraTrialPhoto;
}

/** The composed live picture (camera + transparent "before" layer), read fresh for every broadcast frame. */
export interface InfraLiveComposition {
  readonly video: HTMLVideoElement;
  /** Size of the on-screen stage; the video is cropped to it exactly like `object-cover`. */
  readonly stageW: number;
  readonly stageH: number;
  /** The "before" layer; null until it is aligned (then only the camera is shown, as on screen). */
  readonly overlay: { readonly url: string; readonly width: number; readonly height: number } | null;
  /** Overlay pixels -> stage pixels: the SAME (possibly perspective) 3x3 as on screen (row-major). */
  readonly matrix: Mat3 | null;
  readonly opacity: number;
}

/** A point of the live picture, normalised to the PICTURE (0..1 of its width / height), never to a screen. */
export interface InfraRemotePoint {
  readonly x: number;
  readonly y: number;
}

export type InfraRemoteNudge =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'rotateLeft'
  | 'rotateRight'
  | 'smaller'
  | 'larger';

/** What the second phone may ask the live camera screen to do. The screen stays the source of truth. */
export type InfraRemoteCommand =
  | { readonly t: 'pins'; readonly pins: readonly InfraRemotePoint[] }
  | { readonly t: 'nudge'; readonly dir: InfraRemoteNudge }
  | { readonly t: 'adjustUndo' }
  | { readonly t: 'adjustReset' }
  | { readonly t: 'opacity'; readonly value: number }
  | { readonly t: 'perspective'; readonly on: boolean }
  | { readonly t: 'lock'; readonly on: boolean }
  | { readonly t: 'freeze'; readonly on: boolean }
  | { readonly t: 'realign' };

/** The alignment state of the live camera screen, as shown on the second phone. */
export interface InfraRemoteState {
  /** Both source and live points are placed and an alignment exists. */
  readonly aligned: boolean;
  readonly pins: readonly InfraRemotePoint[];
  /** Landmarks of the source photo (numbered reference). */
  readonly refPins: readonly InfraRemotePoint[];
  readonly opacity: number;
  readonly perspective: boolean;
  readonly canPerspective: boolean;
  readonly locked: boolean;
  readonly frozen: boolean;
  readonly quality: 'good' | 'needsFix' | 'failed' | null;
  readonly canUndoAdjust: boolean;
  readonly canResetAdjust: boolean;
  /** Shape of the picture the points refer to. */
  readonly stage: { readonly w: number; readonly h: number } | null;
  /** Changes whenever the picture shape changes (the old points no longer fit the scene). */
  readonly epoch: number;
}

/** The small source photo (with its landmarks) the second phone needs to know which points to mark. */
export interface InfraLiveReference {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface InfraLiveRemote {
  readonly getState: () => InfraRemoteState | null;
  /** Called after every change of the state (may be bursty: callers throttle). Returns an unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Applies one command that the broadcaster side already checked and range-limited. */
  readonly apply: (command: InfraRemoteCommand) => void;
  readonly getReference: () => InfraLiveReference | null;
  /** Tripod mode: a compact bar, so a phone standing on a tripod hides as little of the wall as possible. */
  readonly setTripod: (on: boolean) => void;
}

export interface InfraLiveShareSource {
  readonly getComposition: () => InfraLiveComposition | null;
  readonly remote: InfraLiveRemote;
}

export interface InfraTrialIntegration {
  readonly preset?: InfraTrialPreset | null;
  /** Live camera only: a "share broadcast" control that receives the composed picture. */
  readonly renderLiveShare?: (source: InfraLiveShareSource) => ReactNode;
  readonly locations: readonly InfraTrialLocation[];
  readonly defaultLocationId: string | null;
  /** Extra pickers rendered next to camera / choose (project gallery, connected storage). */
  readonly renderPhotoSources?: (slot: InfraTrialSlot, onPhoto: (photo: InfraTrialPhoto) => void) => ReactNode;
  /** The latest photos of the chosen location as one-tap choices (nothing is uploaded or saved by choosing). */
  readonly renderRecentPhotos?: (onPhoto: (photo: InfraTrialPhoto) => void) => ReactNode;
  /** Called only after the user confirmed the save sheet. */
  readonly onSave: (input: InfraTrialSaveInput, options: InfraTrialSaveOptions) => Promise<InfraTrialSaveOutcome>;
  /** Reopen a saved result straight into the comparison view. */
  readonly initial?: InfraTrialInitial | null;
  /** Leaves the experiment (back to the workspace). */
  readonly onExit?: () => void;
}
