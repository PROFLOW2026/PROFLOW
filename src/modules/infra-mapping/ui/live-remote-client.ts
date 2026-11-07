/**
 * The watching phone's side of remote marking: keeps the broadcaster's latest state, the small reference
 * picture, and sends commands the broadcaster checks again. Pure logic (no React, no LiveKit): the transport is
 * injected, so it is unit-testable.
 *
 * The broadcaster is the source of truth: nothing here is "applied" locally. A command only asks; the answer
 * is the next `state`, whose `ack` says which of our commands the broadcaster has taken in.
 */

import {
  LIVE_CONTROL,
  ReferenceAssembler,
  encodePacket,
  parseHostPacket,
  type RemoteState,
  type ViewerCommand,
} from '../domain/live-control';

export interface RemoteViewerSnapshot {
  readonly state: RemoteState | null;
  /** The small JPEG data URL of the source photo (only while remote marking is approved). */
  readonly reference: string | null;
  /** Control token the broadcaster currently expects (empty while control is off). */
  readonly token: string;
  /** Picture-shape epoch of the latest state. */
  readonly epoch: number;
  /** Highest sequence number of ours that was sent. */
  readonly sent: number;
}

export type ViewerCommandNoSync = Exclude<ViewerCommand, { t: 'sync' }>;

export interface RemoteViewerDeps {
  readonly sessionId: string;
  readonly send: (bytes: Uint8Array<ArrayBuffer>) => void;
  /** True when LiveKit currently allows this phone to publish data (the broadcaster approved control). */
  readonly canSend: () => boolean;
  readonly onChange: (snapshot: RemoteViewerSnapshot) => void;
}

export class RemoteViewerClient {
  private snapshotValue: RemoteViewerSnapshot = { state: null, reference: null, token: '', epoch: 0, sent: 0 };
  private hostSeq = 0;
  private referenceId = '';
  private readonly assembler = new ReferenceAssembler();

  constructor(private readonly deps: RemoteViewerDeps) {}

  get snapshot(): RemoteViewerSnapshot {
    return this.snapshotValue;
  }

  /** True when commands can be sent right now. */
  get canCommand(): boolean {
    const { state, token } = this.snapshotValue;
    return Boolean(state?.control) && token !== '' && this.deps.canSend();
  }

  /** Handles one packet of the control topic. Anything not from this session, malformed, or older is dropped. */
  receive(bytes: Uint8Array): void {
    const parsed = parseHostPacket(bytes);
    if (!parsed.ok) return;
    const { packet } = parsed;
    if (packet.sid !== this.deps.sessionId) return;
    if (packet.n <= this.hostSeq) return; // an older or repeated packet
    this.hostSeq = packet.n;

    if (packet.msg.t === 'state') {
      const state = packet.msg.s;
      const tokenChanged = packet.c !== this.snapshotValue.token;
      this.update({
        state,
        token: state.control ? packet.c : '',
        epoch: packet.e,
        // A new grant / a new connection starts a new sequence on the broadcaster; ours starts again too.
        sent: tokenChanged ? 0 : this.snapshotValue.sent,
        // Without approval the source picture is not kept.
        reference: state.control ? this.snapshotValue.reference : null,
      });
      return;
    }

    if (!this.snapshotValue.state?.control) return; // the picture is only for an approved session
    const dataUrl = this.assembler.push(packet.msg);
    if (dataUrl) {
      this.referenceId = this.assembler.currentId;
      this.update({ reference: dataUrl });
    }
  }

  /** Asks the broadcaster for its state (and the reference picture, when we do not have it). */
  sync(): void {
    if (!this.deps.canSend()) return;
    this.write('', 0, 0, { t: 'sync', ...(this.referenceId ? { ref: this.referenceId } : {}) });
  }

  /** Sends one command. Returns its sequence number, or null when nothing can be sent right now. */
  command(command: ViewerCommandNoSync): number | null {
    if (!this.canCommand) return null;
    const next = this.snapshotValue.sent + 1;
    const ok = this.write(this.snapshotValue.token, next, this.snapshotValue.epoch, command);
    if (!ok) return null;
    this.update({ sent: next });
    return next;
  }

  private write(token: string, n: number, epoch: number, cmd: ViewerCommand): boolean {
    const bytes = encodePacket({
      p: LIVE_CONTROL.protocol,
      v: LIVE_CONTROL.version,
      sid: this.deps.sessionId,
      c: token,
      n,
      e: epoch,
      cmd,
    });
    if (!bytes) return false;
    this.deps.send(bytes);
    return true;
  }

  private update(patch: Partial<RemoteViewerSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch };
    this.deps.onChange(this.snapshotValue);
  }
}
