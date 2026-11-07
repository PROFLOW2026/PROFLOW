/**
 * Remote marking over the existing live-share LiveKit room (data channel): the second phone can place the
 * four reference points and tune the alignment of the broadcasting phone. Client-safe and pure: no network.
 *
 * Trust model
 *  - The link stays view-only. LiveKit only lets the viewer publish data after the broadcaster approved remote
 *    control for the active session (server side permission), and the broadcaster enforces it AGAIN here
 *    (`ControlGate`): wrong session, wrong control token, stale or repeated sequence number, out-of-range values
 *    and commands built for an older picture shape are all dropped.
 *  - The broadcaster is the single source of truth. The viewer only sends commands; the alignment lives on the
 *    broadcaster and is echoed back as a `state`.
 *  - Points are normalised to the PICTURE (0..1 of its width / height), never to a screen, so zoom, crop and
 *    different aspect ratios on the two phones cannot move a point.
 *  - Nothing here reaches the database, the storage or any saving action.
 */

import { z } from 'zod';

export const LIVE_CONTROL = {
  /** LiveKit data topic of every control packet. */
  topic: 'pf-infra-ctl',
  protocol: 'pf-infra',
  version: 1,
  /** The four reference points. */
  maxPins: 4,
  /** A reliable LiveKit packet should stay below ~15 KiB. */
  maxPacketBytes: 14_000,
  /** Characters of one reference-image chunk, and the whole (small) reference image. */
  chunkChars: 9_000,
  maxReferenceChunks: 8,
  maxReferenceChars: 60_000,
  minOpacity: 0.1,
  maxOpacity: 1,
  /** The broadcaster repeats its state this often while a viewer is connected. */
  heartbeatMs: 4_000,
  /** Largest side (px) of the small reference picture that is sent to the viewer. */
  referenceMaxSide: 240,
} as const;

/* -------------------------------------------------------------------------- */
/* Schemas                                                                      */
/* -------------------------------------------------------------------------- */

const unit = z.number().min(0).max(1);
export const normalizedPointSchema = z.strictObject({ x: unit, y: unit });
export type NormalizedPoint = z.infer<typeof normalizedPointSchema>;

export const NUDGE_DIRECTIONS = [
  'left',
  'right',
  'up',
  'down',
  'rotateLeft',
  'rotateRight',
  'smaller',
  'larger',
] as const;
export type NudgeDirection = (typeof NUDGE_DIRECTIONS)[number];

const commandSchema = z.discriminatedUnion('t', [
  /** Asks the broadcaster for its current state (and the reference picture when the viewer lacks it). */
  z.strictObject({ t: z.literal('sync'), ref: z.string().max(40).optional() }),
  z.strictObject({ t: z.literal('pins'), pins: z.array(normalizedPointSchema).max(LIVE_CONTROL.maxPins) }),
  z.strictObject({ t: z.literal('nudge'), dir: z.enum(NUDGE_DIRECTIONS) }),
  z.strictObject({ t: z.literal('adjustUndo') }),
  z.strictObject({ t: z.literal('adjustReset') }),
  z.strictObject({ t: z.literal('opacity'), value: z.number().min(LIVE_CONTROL.minOpacity).max(LIVE_CONTROL.maxOpacity) }),
  z.strictObject({ t: z.literal('perspective'), on: z.boolean() }),
  z.strictObject({ t: z.literal('lock'), on: z.boolean() }),
  z.strictObject({ t: z.literal('freeze'), on: z.boolean() }),
  z.strictObject({ t: z.literal('realign') }),
  /** The viewer hands control back to the broadcaster. */
  z.strictObject({ t: z.literal('release') }),
]);
export type ViewerCommand = z.infer<typeof commandSchema>;

const controlToken = z.string().regex(/^[a-f0-9]{16}$/);
const sessionId = z.string().min(8).max(80);

/** Viewer -> broadcaster. `c` is empty only for `sync` (the viewer does not know the control token yet). */
export const viewerPacketSchema = z.strictObject({
  p: z.literal(LIVE_CONTROL.protocol),
  v: z.literal(LIVE_CONTROL.version),
  /** Session id: the LiveKit room name. */
  sid: sessionId,
  /** Control token the broadcaster handed out for this grant / this viewer connection. */
  c: z.union([controlToken, z.literal('')]),
  /** Sequence number: strictly increasing inside one control token. */
  n: z.number().int().min(0).max(2_000_000_000),
  /** Picture-shape epoch the command was made for. */
  e: z.number().int().min(0).max(1_000_000),
  cmd: commandSchema,
});
export type ViewerPacket = z.infer<typeof viewerPacketSchema>;

export const qualitySchema = z.enum(['good', 'needsFix', 'failed']);

export const remoteStateSchema = z.object({
  /** Remote control is approved right now. */
  control: z.boolean(),
  tripod: z.boolean(),
  /** The four points are placed and an alignment exists. */
  aligned: z.boolean(),
  pins: z.array(normalizedPointSchema).max(LIVE_CONTROL.maxPins),
  /** Landmarks of the broadcaster's source photo (for the numbered reference picture). */
  refPins: z.array(normalizedPointSchema).max(LIVE_CONTROL.maxPins),
  refId: z.string().max(40).nullable(),
  opacity: z.number().min(0).max(1),
  perspective: z.boolean(),
  canPerspective: z.boolean(),
  locked: z.boolean(),
  frozen: z.boolean(),
  quality: qualitySchema.nullable(),
  canUndoAdjust: z.boolean(),
  canResetAdjust: z.boolean(),
  /** Highest viewer sequence number the broadcaster accepted (lets the viewer drop its draft). */
  ack: z.number().int().min(0),
  /** Shape of the broadcast picture. */
  stage: z.strictObject({ w: z.number().min(1).max(20_000), h: z.number().min(1).max(20_000) }).nullable(),
});
export type RemoteState = z.infer<typeof remoteStateSchema>;

const hostMessageSchema = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('state'), s: remoteStateSchema }),
  z.strictObject({
    t: z.literal('ref'),
    id: z.string().min(1).max(40),
    i: z.number().int().min(0).max(LIVE_CONTROL.maxReferenceChunks - 1),
    k: z.number().int().min(1).max(LIVE_CONTROL.maxReferenceChunks),
    d: z.string().max(LIVE_CONTROL.chunkChars),
  }),
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;

/** Broadcaster -> viewer. */
export const hostPacketSchema = z.strictObject({
  p: z.literal(LIVE_CONTROL.protocol),
  v: z.literal(LIVE_CONTROL.version),
  sid: sessionId,
  c: z.union([controlToken, z.literal('')]),
  /** Broadcaster's own increasing sequence number (the viewer drops older / repeated ones). */
  n: z.number().int().min(0).max(2_000_000_000),
  /** Current picture-shape epoch. */
  e: z.number().int().min(0).max(1_000_000),
  msg: hostMessageSchema,
});
export type HostPacket = z.infer<typeof hostPacketSchema>;

/* -------------------------------------------------------------------------- */
/* Wire format                                                                  */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** JSON bytes of a packet, or null when it would not fit one reliable packet. */
export function encodePacket(packet: ViewerPacket | HostPacket): Uint8Array<ArrayBuffer> | null {
  const bytes = encoder.encode(JSON.stringify(packet));
  return bytes.byteLength <= LIVE_CONTROL.maxPacketBytes ? bytes : null;
}

export type ParseResult<T> = { readonly ok: true; readonly packet: T } | { readonly ok: false };

function decode(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > LIVE_CONTROL.maxPacketBytes) return undefined;
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return undefined;
  }
}

export function parseViewerPacket(bytes: Uint8Array): ParseResult<ViewerPacket> {
  const parsed = viewerPacketSchema.safeParse(decode(bytes));
  return parsed.success ? { ok: true, packet: parsed.data } : { ok: false };
}

export function parseHostPacket(bytes: Uint8Array): ParseResult<HostPacket> {
  const parsed = hostPacketSchema.safeParse(decode(bytes));
  return parsed.success ? { ok: true, packet: parsed.data } : { ok: false };
}

/* -------------------------------------------------------------------------- */
/* Broadcaster-side admission                                                   */
/* -------------------------------------------------------------------------- */

export type AdmitRefusal = 'session' | 'disabled' | 'token' | 'stale' | 'epoch';
export type AdmitResult = { readonly ok: true } | { readonly ok: false; readonly reason: AdmitRefusal };

/** Commands whose meaning depends on the shape of the picture they were made on. */
function dependsOnPictureShape(command: ViewerCommand): boolean {
  return (
    command.t === 'pins' || command.t === 'nudge' || command.t === 'adjustUndo' || command.t === 'adjustReset'
  );
}

/**
 * The broadcaster's door. Remote commands are accepted only while the broadcaster has approved control for
 * the active session, with the current control token, in strictly increasing order, and (for geometry) for the
 * current picture shape. `sync` is always answered (it only makes the broadcaster send its state).
 */
export class ControlGate {
  private enabled = false;
  private token = '';
  private last = 0;

  constructor(
    readonly sessionId: string,
    private readonly makeToken: () => string,
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  get currentToken(): string {
    return this.token;
  }

  /** Highest accepted viewer sequence number (echoed back as `ack`). */
  get acknowledged(): number {
    return this.last;
  }

  /** The broadcaster approves remote control: a fresh token invalidates anything sent before. */
  enable(): string {
    this.enabled = true;
    return this.rotate();
  }

  /** Remote control is withdrawn (or handed back): nothing remote is accepted any more. */
  disable(): void {
    this.enabled = false;
    this.token = '';
    this.last = 0;
  }

  /** A viewer (re)connected: new token and a fresh sequence, so stale packets of the old connection are dropped. */
  rotate(): string {
    this.token = this.makeToken();
    this.last = 0;
    return this.token;
  }

  admit(packet: ViewerPacket, epoch: number): AdmitResult {
    if (packet.sid !== this.sessionId) return { ok: false, reason: 'session' };
    if (packet.cmd.t === 'sync') return { ok: true };
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    if (packet.c !== this.token) return { ok: false, reason: 'token' };
    if (packet.n <= this.last) return { ok: false, reason: 'stale' };
    this.last = packet.n;
    if (dependsOnPictureShape(packet.cmd) && packet.e !== epoch) return { ok: false, reason: 'epoch' };
    return { ok: true };
  }
}

/** Random 16-hex control token (browser or Node). */
export function randomControlToken(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/* -------------------------------------------------------------------------- */
/* Small reference picture, in chunks                                           */
/* -------------------------------------------------------------------------- */

const REFERENCE_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** Splits the reference picture (JPEG data URL) into packets-sized pieces; null when it is too large or not a JPEG. */
export function chunkReference(dataUrl: string, id: string): { id: string; i: number; k: number; d: string }[] | null {
  if (dataUrl.length > LIVE_CONTROL.maxReferenceChars || !REFERENCE_PATTERN.test(dataUrl)) return null;
  const k = Math.ceil(dataUrl.length / LIVE_CONTROL.chunkChars);
  if (k < 1 || k > LIVE_CONTROL.maxReferenceChunks) return null;
  return Array.from({ length: k }, (_, i) => ({
    id,
    i,
    k,
    d: dataUrl.slice(i * LIVE_CONTROL.chunkChars, (i + 1) * LIVE_CONTROL.chunkChars),
  }));
}

/** Viewer side: puts the chunks of one reference picture back together (in any order, repeats ignored). */
export class ReferenceAssembler {
  private id = '';
  private parts: (string | undefined)[] = [];

  /** Returns the data URL once every chunk of the picture has arrived and it is a plain JPEG data URL. */
  push(chunk: { id: string; i: number; k: number; d: string }): string | null {
    if (chunk.id !== this.id || chunk.k !== this.parts.length) {
      this.id = chunk.id;
      this.parts = new Array<string | undefined>(chunk.k).fill(undefined);
    }
    if (chunk.i >= this.parts.length) return null;
    this.parts[chunk.i] = chunk.d;
    if (this.parts.some((part) => part === undefined)) return null;
    const joined = this.parts.join('');
    return joined.length <= LIVE_CONTROL.maxReferenceChars && REFERENCE_PATTERN.test(joined) ? joined : null;
  }

  get currentId(): string {
    return this.id;
  }
}
