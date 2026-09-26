/** Public client-safe exports for Quick Capture domain types and helpers. */

export type {
  CaptureStatus,
  SessionKind,
  DetectedType,
  DetectionConfidence,
  CaptureSource,
  CaptureItemRecord,
  CaptureDocumentRecord,
  CaptureSuggestionMetadata,
  NoteProjectHint,
  SessionFileInput,
  PreparedCaptureDocument,
  SubmitCaptureResult,
} from './domain/types';

export {
  CAPTURE_STATUSES,
  SESSION_KINDS,
  DETECTED_TYPES,
  DETECTION_CONFIDENCES,
  CAPTURE_SOURCES,
} from './domain/types';

export { validateSessionFiles, MAX_CAPTURE_IMAGES } from './domain/capture-session-limits';
export { classifyCapture } from './domain/classify-capture';
export type { ClassifyCaptureInput, ClassifyCaptureResult } from './domain/classify-capture';
export { extractNoteProjectHints } from './domain/note-project-hints';
export {
  FIELD_MEDIA_CATEGORIES,
  isFieldMediaCategory,
  assertFieldMediaCategory,
} from './domain/field-media-categories';
export type { FieldMediaCategory } from './domain/field-media-categories';
export {
  isVideoMimeType,
  isVideoSessionMime,
  normalizeRecorderVideoMime,
  APPROVED_VIDEO_MIME_TYPES,
} from './domain/video-mime';
