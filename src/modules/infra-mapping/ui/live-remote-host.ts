/**
 * The broadcasting phone's side of remote marking. It owns the door (`ControlGate`), applies the commands the
 * second phone sends to the live camera screen, and keeps the second phone informed with small state packets.
 *
 * No React and no LiveKit here: the transport is injected, so the rules (who may do what, stale / duplicate /
 * out-of-range packets, reconnecting) are unit-testable without a network.
 */

import type {
  InfraLiveRemote,
  InfraRemoteCommand,
  InfraRemoteState,
} from '@/modules/project-workspace/ui/infra-trial-integration';
import { LIVE_SHARE } from '../domain/live-share';
import {
  ControlGate,
  LIVE_CONTROL,
  chunkReference,
  encodePacket,
  parseViewerPacket,
  randomControlToken,
  type HostMessage,
  type RemoteState,
} from '../domain/live-control';

/** What happened to one incoming packet (also what the unit tests assert). */
export type ReceiveOutcome =
  | 'applied'
  | 'state'
  | 'released'
  | 'ignored-sender'
  | 'invalid'
  | `refused-${'session' | 'disabled' | 'token' | 'stale' | 'epoch'}`;

export interface RemoteHostDeps {
  /** The LiveKit room name; every packet must carry it. */
  readonly sessionId: string;
  readonly remote: InfraLiveRemote;
  /** Publishes one reliable packet on the control topic. */
  readonly send: (bytes: Uint8Array<ArrayBuffer>) => void;
  /** A small JPEG data URL of the source photo (null when it cannot be made). */
  readonly loadReference: () => Promise<string | null>;
  /** The second phone handed control back. The caller withdraws the server-side grant. */
  readonly onReleased?: () => void;
  readonly makeToken?: () => string;
  readonly now?: () => number;
}

/** State packets closer together than this are merged into one (a drag would otherwise flood the channel). */
const PUBLISH_DELAY_MS = 80;
/** A `sync` request is answered at once, but never more often than this. */
const SYNC_MIN_GAP_MS = 250;

export class RemoteHostController {
  private readonly gate: ControlGate;
  private readonly now: () => number;
  private seq = 0;
  private tripod = false;
  private viewerPresent = false;
  private lastPublish = 0;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private reference: { id: string; chunks: NonNullable<ReturnType<typeof chunkReference>> } | null = null;
  private referenceLoading = false;
  private referenceCounter = 0;

  constructor(private readonly deps: RemoteHostDeps) {
    this.gate = new ControlGate(deps.sessionId, deps.makeToken ?? randomControlToken);
    this.now = deps.now ?? (() => Date.now());
  }

  get controlEnabled(): boolean {
    return this.gate.isEnabled;
  }

  /** Starts mirroring the screen's state to the second phone (throttled). */
  start(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.deps.remote.subscribe(() => this.schedulePublish());
  }

  setViewerPresent(present: boolean): void {
    if (this.disposed || present === this.viewerPresent) return;
    this.viewerPresent = present;
    if (present) {
      // A (re)connected viewer starts a fresh control token and sequence: late packets of the old
      // connection can never be applied. The alignment itself lives here and is simply sent again.
      if (this.gate.isEnabled) this.gate.rotate();
      this.publishNow();
      if (this.gate.isEnabled) void this.sendReference();
      this.heartbeat = setInterval(() => this.publishNow(), LIVE_CONTROL.heartbeatMs);
    } else if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  /** The broadcaster approves / withdraws remote marking (the server-side grant is handled by the caller). */
  setControl(enabled: boolean): void {
    if (this.disposed || enabled === this.gate.isEnabled) return;
    if (enabled) {
      this.gate.enable();
      this.publishNow();
      if (this.viewerPresent) void this.sendReference();
    } else {
      this.gate.disable();
      this.publishNow();
    }
  }

  setTripod(on: boolean): void {
    this.tripod = on;
    this.deps.remote.setTripod(on);
    this.schedulePublish();
  }

  /** Publishes the state again (for example after the broadcaster's own connection came back). */
  republish(): void {
    this.publishNow();
    if (this.gate.isEnabled && this.viewerPresent) void this.sendReference();
  }

  receive(bytes: Uint8Array, senderIdentity: string | null | undefined): ReceiveOutcome {
    if (this.disposed) return 'invalid';
    // Only the viewer of this room can control; anything else (or an unknown sender) is ignored.
    if (!senderIdentity || !senderIdentity.startsWith(LIVE_SHARE.viewerIdentityPrefix)) return 'ignored-sender';
    const parsed = parseViewerPacket(bytes);
    if (!parsed.ok) return 'invalid';
    const { packet } = parsed;

    const epoch = this.deps.remote.getState()?.epoch ?? -1;
    const admitted = this.gate.admit(packet, epoch);
    if (!admitted.ok) {
      // The viewer is out of date (older picture shape, old token): tell it the truth right away.
      if (admitted.reason === 'epoch' || admitted.reason === 'token') this.schedulePublish();
      return `refused-${admitted.reason}`;
    }

    const command = packet.cmd;
    if (command.t === 'sync') {
      if (this.now() - this.lastPublish >= SYNC_MIN_GAP_MS) this.publishNow();
      else this.schedulePublish();
      if (this.gate.isEnabled && command.ref !== this.reference?.id) void this.sendReference();
      return 'state';
    }
    if (command.t === 'release') {
      this.gate.disable();
      this.publishNow();
      this.deps.onReleased?.();
      return 'released';
    }
    this.deps.remote.apply(command satisfies InfraRemoteCommand);
    this.schedulePublish();
    return 'applied';
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.publishTimer !== null) clearTimeout(this.publishTimer);
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.publishTimer = null;
    this.heartbeat = null;
    this.gate.disable();
  }

  /* ---- sending ---- */

  private schedulePublish(): void {
    if (this.disposed || this.publishTimer !== null) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publishNow();
    }, PUBLISH_DELAY_MS);
  }

  private publishNow(): void {
    if (this.disposed) return;
    if (this.publishTimer !== null) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    const state = this.deps.remote.getState();
    if (!state) return;
    this.lastPublish = this.now();
    this.sendMessage({ t: 'state', s: this.toWireState(state) }, state.epoch);
  }

  private toWireState(state: InfraRemoteState): RemoteState {
    const control = this.gate.isEnabled;
    return {
      control,
      tripod: this.tripod,
      aligned: state.aligned,
      pins: state.pins.slice(0, LIVE_CONTROL.maxPins).map((pin) => ({ x: pin.x, y: pin.y })),
      // The source photo's landmarks and picture are only shared while remote marking is approved.
      refPins: control ? state.refPins.slice(0, LIVE_CONTROL.maxPins).map((pin) => ({ x: pin.x, y: pin.y })) : [],
      refId: control ? (this.reference?.id ?? null) : null,
      opacity: state.opacity,
      perspective: state.perspective,
      canPerspective: state.canPerspective,
      locked: state.locked,
      frozen: state.frozen,
      quality: state.quality,
      canUndoAdjust: state.canUndoAdjust,
      canResetAdjust: state.canResetAdjust,
      ack: this.gate.acknowledged,
      stage: state.stage ? { w: state.stage.w, h: state.stage.h } : null,
    };
  }

  private sendMessage(msg: HostMessage, epoch: number): void {
    this.seq += 1;
    const bytes = encodePacket({
      p: LIVE_CONTROL.protocol,
      v: LIVE_CONTROL.version,
      sid: this.deps.sessionId,
      c: this.gate.currentToken,
      n: this.seq,
      e: epoch,
      msg,
    });
    if (bytes) this.deps.send(bytes);
  }

  /** Sends the small source picture in chunks (made once per session; only while control is approved). */
  private async sendReference(): Promise<void> {
    if (this.disposed || !this.gate.isEnabled) return;
    if (!this.reference && !this.referenceLoading) {
      this.referenceLoading = true;
      try {
        const dataUrl = await this.deps.loadReference();
        this.referenceCounter += 1;
        const id = `r${this.referenceCounter}${this.deps.sessionId.slice(-6)}`.slice(0, 40);
        const chunks = dataUrl ? chunkReference(dataUrl, id) : null;
        this.reference = chunks ? { id, chunks } : null;
      } finally {
        this.referenceLoading = false;
      }
      if (this.disposed || !this.gate.isEnabled) return;
      this.publishNow(); // now it carries the reference id
    }
    const epoch = this.deps.remote.getState()?.epoch ?? 0;
    for (const chunk of this.reference?.chunks ?? []) this.sendMessage({ t: 'ref', ...chunk }, epoch);
  }
}
