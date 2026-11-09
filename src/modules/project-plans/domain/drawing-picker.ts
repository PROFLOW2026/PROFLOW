import type { DrawingRevisionStatus } from './types';

export interface DrawingPickerRevision {
  readonly id: string;
  readonly label: string;
  readonly status: DrawingRevisionStatus;
}

/** One project drawing and its published revisions for create-form pickers. */
export interface DrawingPickerOption {
  readonly drawingId: string;
  readonly drawingNumber: string;
  readonly title: string;
  readonly revisions: readonly DrawingPickerRevision[];
}

export interface ResolvedDrawingLink {
  readonly drawingNumber: string;
  readonly title: string;
  readonly revisionLabel: string | null;
}
