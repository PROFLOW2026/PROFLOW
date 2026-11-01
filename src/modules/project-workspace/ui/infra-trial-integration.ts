import type { ReactNode } from 'react';

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
  readonly view: 'overlay' | 'sideBySide' | 'after' | null;
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

export interface InfraTrialIntegration {
  readonly preset?: InfraTrialPreset | null;
  readonly locations: readonly InfraTrialLocation[];
  readonly defaultLocationId: string | null;
  /** Extra pickers rendered next to camera / choose (project gallery, connected storage). */
  readonly renderPhotoSources?: (slot: InfraTrialSlot, onPhoto: (photo: InfraTrialPhoto) => void) => ReactNode;
  /** Called only after the user confirmed the save sheet. */
  readonly onSave: (input: InfraTrialSaveInput, options: InfraTrialSaveOptions) => Promise<InfraTrialSaveOutcome>;
  /** Reopen a saved result straight into the comparison view. */
  readonly initial?: InfraTrialInitial | null;
  /** Leaves the experiment (back to the workspace). */
  readonly onExit?: () => void;
}
