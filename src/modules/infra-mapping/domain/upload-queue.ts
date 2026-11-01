/**
 * Capture -> approval -> upload queue (pure state machine, shared by the UI and tests).
 *
 * Invariants:
 *  - a photo is NEVER uploaded unless the user approved it ("approved" is the only entry to upload);
 *  - capturing the next photo never waits for an upload (continuous shooting);
 *  - a failed upload keeps the approved photo in memory and can be retried or discarded;
 *  - the location is the only mandatory field.
 */

export type QueueStatus =
  | 'pending_approval' // captured, previewing - not uploaded
  | 'approved' // user approved - waiting for an upload slot
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'cancelled'; // user cancelled / retook - never uploaded

export interface QueueDetails {
  readonly description: string;
  readonly room: string;
  readonly wall: string;
  readonly infraType: string;
  readonly dimensions: string;
  readonly note: string;
  readonly role: 'documentation' | 'after_closure' | 'reference';
}

export const EMPTY_QUEUE_DETAILS: QueueDetails = {
  description: '',
  room: '',
  wall: '',
  infraType: '',
  dimensions: '',
  note: '',
  role: 'documentation',
};

export interface QueueItem {
  readonly clientId: string;
  readonly status: QueueStatus;
  readonly locationId: string | null;
  readonly details: QueueDetails;
  readonly source: 'camera' | 'gallery' | 'storage';
  readonly attempts: number;
  readonly error: string | null;
  readonly captureId: string | null;
}

export const MAX_CONCURRENT_UPLOADS = 2;
export const MAX_UPLOAD_ATTEMPTS = 5;

export function newQueueItem(input: {
  clientId: string;
  locationId: string | null;
  source: QueueItem['source'];
  details?: Partial<QueueDetails>;
}): QueueItem {
  return {
    clientId: input.clientId,
    status: 'pending_approval',
    locationId: input.locationId,
    details: { ...EMPTY_QUEUE_DETAILS, ...input.details },
    source: input.source,
    attempts: 0,
    error: null,
    captureId: null,
  };
}

export function canApprove(item: QueueItem): boolean {
  return item.status === 'pending_approval' && Boolean(item.locationId);
}

/** Approval is the only door to the upload. Returns the same item when it cannot be approved. */
export function approve(item: QueueItem): QueueItem {
  return canApprove(item) ? { ...item, status: 'approved', error: null } : item;
}

/** Retake / cancel: a not-yet-approved photo is dropped without ever being uploaded. */
export function cancel(item: QueueItem): QueueItem {
  return item.status === 'pending_approval' || item.status === 'failed' ? { ...item, status: 'cancelled' } : item;
}

export function startUpload(item: QueueItem): QueueItem {
  if (item.status !== 'approved') return item;
  return { ...item, status: 'uploading', attempts: item.attempts + 1, error: null };
}

export function finishUpload(item: QueueItem, captureId: string): QueueItem {
  return item.status === 'uploading' ? { ...item, status: 'uploaded', captureId, error: null } : item;
}

export function failUpload(item: QueueItem, error: string): QueueItem {
  return item.status === 'uploading' ? { ...item, status: 'failed', error } : item;
}

/** Manual retry of a failed upload (goes back through the approved state). */
export function retry(item: QueueItem): QueueItem {
  return item.status === 'failed' && item.attempts < MAX_UPLOAD_ATTEMPTS ? { ...item, status: 'approved', error: null } : item;
}

export function canRetry(item: QueueItem): boolean {
  return item.status === 'failed' && item.attempts < MAX_UPLOAD_ATTEMPTS;
}

/** Items eligible to start now (approved only), respecting the concurrency limit. */
export function nextUploadable(queue: readonly QueueItem[], max = MAX_CONCURRENT_UPLOADS): QueueItem[] {
  const running = queue.filter((item) => item.status === 'uploading').length;
  const slots = Math.max(0, max - running);
  return queue.filter((item) => item.status === 'approved').slice(0, slots);
}

export function queueSummary(queue: readonly QueueItem[]): {
  readonly waiting: number;
  readonly uploading: number;
  readonly failed: number;
  readonly uploaded: number;
} {
  const count = (status: QueueStatus) => queue.filter((item) => item.status === status).length;
  return {
    waiting: count('approved') + count('pending_approval'),
    uploading: count('uploading'),
    failed: count('failed'),
    uploaded: count('uploaded'),
  };
}

/** True while leaving the page would lose an approved / failed photo that is not in the cloud yet. */
export function hasUnsavedWork(queue: readonly QueueItem[]): boolean {
  return queue.some((item) => item.status === 'approved' || item.status === 'uploading' || item.status === 'failed');
}
