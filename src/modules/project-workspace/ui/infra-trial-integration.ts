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

export interface InfraLiveShareSource {
  readonly getComposition: () => InfraLiveComposition | null;
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
