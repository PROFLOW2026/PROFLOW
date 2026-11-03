/**
 * Live camera sharing ("שתף שידור") - client-safe contract.
 *
 * One phone (the host) publishes the composed picture (camera + infrastructure overlay) as a
 * video-only LiveKit stream; a second phone (the viewer) watches it. Nothing is recorded, stored or
 * uploaded, and no database is involved: the room lives only inside LiveKit.
 */

export const LIVE_SHARE = {
  roomPrefix: 'pf-live-',
  hostIdentity: 'host',
  viewerIdentityPrefix: 'viewer-',
  /** Exactly one host and one viewer. */
  maxParticipants: 2,
  /** How long a share link stays usable. */
  shareTtlSeconds: 2 * 60 * 60,
  /** Room stays open this long before the host joins / after the last participant leaves (seconds). */
  emptyTimeoutSeconds: 60,
  departureTimeoutSeconds: 20,
  viewerTokenTtlSeconds: 60 * 60,
} as const;

export type LiveShareErrorCode =
  | 'not_configured'
  | 'invalid_link'
  | 'expired'
  | 'ended'
  | 'viewer_taken'
  | 'unavailable';

export const LIVE_SHARE_MESSAGES: Readonly<Record<LiveShareErrorCode, string>> = {
  not_configured: 'שידור חי עדיין לא הופעל בסביבה הזו. נדרשת הגדרת שירות LiveKit בשרת.',
  invalid_link: 'קישור השידור אינו תקין.',
  expired: 'קישור השידור פג תוקף. בקשו קישור חדש מהמשדר.',
  ended: 'השידור הסתיים או עדיין לא התחיל.',
  viewer_taken: 'השידור כבר נצפה במכשיר אחר.',
  unavailable: 'לא ניתן להתחבר לשירות השידור כרגע. נסו שוב.',
};

/** What the broadcasting phone needs to start publishing. */
export interface LiveShareHostSession {
  /** LiveKit WebSocket URL (public by nature; keys never leave the server). */
  readonly url: string;
  /** Short-lived, publish-only (video) token for this one room. */
  readonly token: string;
  /** Opaque signed token carried by the QR / link; also used to end the stream. */
  readonly shareToken: string;
}

/** What the watching phone needs to subscribe. */
export interface LiveShareViewerSession {
  readonly url: string;
  /** Subscribe-only token for this one room. */
  readonly token: string;
}

export type LiveShareResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code?: LiveShareErrorCode };
