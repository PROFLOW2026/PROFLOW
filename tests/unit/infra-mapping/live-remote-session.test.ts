import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InfraLiveRemote,
  InfraRemoteCommand,
  InfraRemoteState,
} from '@/modules/project-workspace/ui/infra-trial-integration';
import { LIVE_CONTROL, encodePacket, type ViewerCommand } from '@/modules/infra-mapping/domain/live-control';
import { RemoteViewerClient, type RemoteViewerSnapshot } from '@/modules/infra-mapping/ui/live-remote-client';
import { RemoteHostController } from '@/modules/infra-mapping/ui/live-remote-host';

const SID = 'infra-live-session-0001';
const JPEG = `data:image/jpeg;base64,${'A'.repeat(20_000)}`;

/** The broadcaster's live camera screen, reduced to what remote control touches. */
function fakeScreen() {
  const listeners = new Set<() => void>();
  const applied: InfraRemoteCommand[] = [];
  let tripod = false;
  const state: { value: InfraRemoteState } = {
    value: {
      aligned: false,
      pins: [],
      refPins: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      opacity: 0.6,
      perspective: false,
      canPerspective: false,
      locked: false,
      frozen: false,
      quality: null,
      canUndoAdjust: false,
      canResetAdjust: false,
      stage: { w: 720, h: 1280 },
      epoch: 0,
    },
  };
  const set = (patch: Partial<InfraRemoteState>) => {
    state.value = { ...state.value, ...patch };
    listeners.forEach((listener) => listener());
  };
  const remote: InfraLiveRemote = {
    getState: () => state.value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: (command) => {
      applied.push(command);
      if (command.t === 'pins') set({ pins: command.pins.map((p) => ({ ...p })), aligned: command.pins.length >= 4 });
      if (command.t === 'opacity') set({ opacity: command.value });
      if (command.t === 'lock') set({ locked: command.on });
      if (command.t === 'freeze') set({ frozen: command.on });
    },
    getReference: () => ({ url: 'blob:private', width: 4000, height: 3000 }),
    setTripod: (on) => {
      tripod = on;
    },
  };
  return { remote, applied, set, isTripod: () => tripod, state };
}

/** Host and viewer wired through memory, the way LiveKit's data channel connects them. */
function session(options: { viewerCanPublish?: boolean } = {}) {
  const screen = fakeScreen();
  let viewerCanPublish = options.viewerCanPublish ?? true;
  const wires: { client: RemoteViewerClient | null } = { client: null };
  const snapshots: RemoteViewerSnapshot[] = [];
  const hostSent: Uint8Array[] = [];
  const viewerSent: Uint8Array[] = [];
  let tokenCounter = 0;

  const host = new RemoteHostController({
    sessionId: SID,
    remote: screen.remote,
    send: (bytes) => {
      hostSent.push(bytes);
      wires.client?.receive(bytes);
    },
    loadReference: async () => JPEG,
    makeToken: () => `00000000000000${(16 + tokenCounter++).toString(16).padStart(2, '0')}`,
  });
  const client = new RemoteViewerClient({
    sessionId: SID,
    send: (bytes) => {
      viewerSent.push(bytes);
      host.receive(bytes, 'viewer-abc');
    },
    canSend: () => viewerCanPublish,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  wires.client = client;
  host.start();
  return {
    screen,
    host,
    client,
    snapshots,
    hostSent,
    viewerSent,
    setViewerCanPublish: (value: boolean) => {
      viewerCanPublish = value;
    },
  };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('remote marking session', () => {
  it('is view-only by default: nothing the viewer sends is applied', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    await settle();
    expect(s.client.snapshot.state?.control).toBe(false);
    expect(s.client.command({ t: 'pins', pins: [{ x: 0.5, y: 0.5 }] })).toBeNull(); // nothing to send with
    // Even a hand-made packet is refused by the broadcaster.
    const forged = encodePacket({
      p: 'pf-infra',
      v: 1,
      sid: SID,
      c: '00000000000000ff',
      n: 1,
      e: 0,
      cmd: { t: 'pins', pins: [{ x: 0.5, y: 0.5 }] },
    })!;
    expect(s.host.receive(forged, 'viewer-abc')).toBe('refused-disabled');
    expect(s.screen.applied).toEqual([]);
  });

  it('does not share the source photo or its landmarks until control is approved', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    await settle();
    expect(s.client.snapshot.reference).toBeNull();
    expect(s.client.snapshot.state?.refPins).toEqual([]);
    expect(s.client.snapshot.state?.refId).toBeNull();
    // Nothing on the wire in view-only mode contains any picture data.
    expect(s.hostSent.every((bytes) => !new TextDecoder().decode(bytes).includes('data:image'))).toBe(true);
  });

  it('approval: the viewer gets the reference, can mark the 4 points, and the broadcaster applies them', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    const snap = s.client.snapshot;
    expect(snap.state?.control).toBe(true);
    expect(snap.state?.refPins).toHaveLength(4);
    expect(snap.reference).toBe(JPEG);
    expect(s.client.canCommand).toBe(true);

    const pins = [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.3 },
      { x: 0.8, y: 0.7 },
      { x: 0.2, y: 0.7 },
    ];
    const n = s.client.command({ t: 'pins', pins });
    expect(n).toBe(1);
    await settle();
    // The same picture coordinates arrive on the broadcaster, unchanged.
    expect(s.screen.applied).toEqual([{ t: 'pins', pins }]);
    expect(s.client.snapshot.state?.pins).toEqual(pins);
    expect(s.client.snapshot.state?.ack).toBe(1);
    expect(s.client.snapshot.state?.aligned).toBe(true);
  });

  it('applies settings (opacity, lock, freeze) and ignores a replayed packet', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    s.client.command({ t: 'opacity', value: 0.35 });
    s.client.command({ t: 'freeze', on: true });
    s.client.command({ t: 'lock', on: true });
    await settle();
    expect(s.screen.state.value).toMatchObject({ opacity: 0.35, frozen: true, locked: true });
    const replay = s.viewerSent[s.viewerSent.length - 1]!;
    const before = s.screen.applied.length;
    expect(s.host.receive(replay, 'viewer-abc')).toBe('refused-stale');
    expect(s.screen.applied).toHaveLength(before);
  });

  it('refuses packets from anyone who is not the viewer, and malformed ones', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    const bytes = encodePacket({
      p: 'pf-infra',
      v: 1,
      sid: SID,
      c: s.client.snapshot.token,
      n: 1,
      e: 0,
      cmd: { t: 'opacity', value: 0.2 },
    })!;
    expect(s.host.receive(bytes, 'host')).toBe('ignored-sender');
    expect(s.host.receive(bytes, null)).toBe('ignored-sender');
    expect(s.host.receive(new TextEncoder().encode('{"x":1}'), 'viewer-abc')).toBe('invalid');
    expect(s.screen.applied).toEqual([]);
  });

  it('drops a command made for an older picture shape and tells the viewer the truth', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    // The broadcaster turned the phone: new epoch, points cleared.
    s.screen.set({ epoch: 1, pins: [], aligned: false });
    // The viewer still builds a command from the old epoch (state not yet seen).
    const stale = encodePacket({
      p: 'pf-infra',
      v: 1,
      sid: SID,
      c: s.client.snapshot.token,
      n: 1,
      e: 0,
      cmd: { t: 'pins', pins: [{ x: 0.4, y: 0.4 }] },
    })!;
    expect(s.host.receive(stale, 'viewer-abc')).toBe('refused-epoch');
    await settle();
    expect(s.screen.applied).toEqual([]);
    expect(s.client.snapshot.epoch).toBe(1);
    expect(s.client.snapshot.state?.pins).toEqual([]);
  });

  it('withdrawing control stops commands immediately and removes the reference on the viewer', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    s.host.setControl(false);
    await settle();
    expect(s.client.snapshot.state?.control).toBe(false);
    expect(s.client.snapshot.reference).toBeNull();
    expect(s.client.command({ t: 'freeze', on: true })).toBeNull();
    expect(s.screen.applied).toEqual([]);
  });

  it('the viewer can hand control back; the broadcaster is told to withdraw the grant', async () => {
    const released = vi.fn();
    const screen = fakeScreen();
    const sent: Uint8Array[] = [];
    const host = new RemoteHostController({
      sessionId: SID,
      remote: screen.remote,
      send: (bytes) => sent.push(bytes),
      loadReference: async () => null,
      onReleased: released,
    });
    host.start();
    host.setViewerPresent(true);
    host.setControl(true);
    const token = JSON.parse(new TextDecoder().decode(sent[sent.length - 1]!)).c as string;
    const release = encodePacket({
      p: 'pf-infra',
      v: 1,
      sid: SID,
      c: token,
      n: 1,
      e: 0,
      cmd: { t: 'release' },
    })!;
    expect(host.receive(release, 'viewer-abc')).toBe('released');
    expect(released).toHaveBeenCalledTimes(1);
    expect(host.controlEnabled).toBe(false);
    host.dispose();
  });

  it('keeps every point when the viewer disconnects and reconnects; the old connection is dead', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    const pins = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
    ];
    s.client.command({ t: 'pins', pins });
    await settle();
    const oldToken = s.client.snapshot.token;
    const oldPacket = s.viewerSent[s.viewerSent.length - 1]!;

    // The viewer drops: the broadcaster carries on alone, the points stay.
    s.host.setViewerPresent(false);
    s.screen.set({ opacity: 0.9 });
    await settle();
    expect(s.screen.state.value.pins).toEqual(pins);

    // The viewer comes back (a new connection): fresh token, the state is restored from the broadcaster.
    s.host.setViewerPresent(true);
    await settle();
    expect(s.client.snapshot.state?.pins).toEqual(pins);
    expect(s.client.snapshot.state?.opacity).toBe(0.9);
    expect(s.client.snapshot.token).not.toBe(oldToken);
    expect(s.client.snapshot.reference).toBe(JPEG);
    // Anything still in flight from the old connection is refused.
    expect(s.host.receive(oldPacket, 'viewer-abc')).toBe('refused-token');
    // And the new connection works from sequence 1 again.
    expect(s.client.command({ t: 'opacity', value: 0.4 })).toBe(1);
    await settle();
    expect(s.screen.state.value.opacity).toBe(0.4);
  });

  it('answers a sync request with the full state (reconnect of the broadcaster, late viewer)', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    s.screen.set({ locked: true });
    const before = s.hostSent.length;
    s.client.sync();
    await settle();
    expect(s.hostSent.length).toBeGreaterThan(before);
    expect(s.client.snapshot.state?.locked).toBe(true);
  });

  it('ignores host packets of another session or older than the latest', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    await settle();
    const latest = s.hostSent[s.hostSent.length - 1]!;
    const seen = s.snapshots.length;
    s.client.receive(latest); // repeated
    expect(s.snapshots.length).toBe(seen);
    const other = JSON.parse(new TextDecoder().decode(latest));
    other.sid = 'infra-live-another-session';
    other.n = 999999;
    s.client.receive(new TextEncoder().encode(JSON.stringify(other)));
    expect(s.snapshots.length).toBe(seen);
  });

  it('tripod mode reaches the camera screen and the viewer', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setTripod(true);
    await settle();
    expect(s.screen.isTripod()).toBe(true);
    expect(s.client.snapshot.state?.tripod).toBe(true);
  });

  it('merges a burst of changes into few state packets', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    const before = s.hostSent.length;
    for (let i = 0; i < 30; i += 1) s.screen.set({ opacity: 0.3 + i * 0.01 });
    await settle();
    expect(s.hostSent.length - before).toBeLessThanOrEqual(2);
  });

  it('a viewer without data permission cannot send (LiveKit refuses it first)', async () => {
    const s = session({ viewerCanPublish: false });
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    expect(s.client.canCommand).toBe(false);
    expect(s.client.command({ t: 'freeze', on: true })).toBeNull();
    s.client.sync();
    expect(s.viewerSent).toHaveLength(0);
  });

  it('repeats its state while a viewer is connected (heartbeat) and stops when the viewer leaves', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    await settle();
    const base = s.hostSent.length;
    await vi.advanceTimersByTimeAsync(LIVE_CONTROL.heartbeatMs * 2 + 100);
    expect(s.hostSent.length - base).toBeGreaterThanOrEqual(2);
    s.host.setViewerPresent(false);
    const after = s.hostSent.length;
    await vi.advanceTimersByTimeAsync(LIVE_CONTROL.heartbeatMs * 3);
    expect(s.hostSent.length).toBe(after);
  });

  it('never sends a command type the broadcaster cannot map (every viewer command is handled)', async () => {
    const s = session();
    s.host.setViewerPresent(true);
    s.host.setControl(true);
    await settle();
    const commands: ViewerCommand[] = [
      { t: 'pins', pins: [{ x: 0.5, y: 0.5 }] },
      { t: 'nudge', dir: 'rotateLeft' },
      { t: 'adjustUndo' },
      { t: 'adjustReset' },
      { t: 'opacity', value: 0.5 },
      { t: 'perspective', on: true },
      { t: 'lock', on: false },
      { t: 'freeze', on: false },
      { t: 'realign' },
    ];
    for (const command of commands) expect(s.client.command(command as never)).not.toBeNull();
    await settle();
    expect(s.screen.applied.map((c) => c.t)).toEqual(commands.map((c) => c.t));
  });
});
