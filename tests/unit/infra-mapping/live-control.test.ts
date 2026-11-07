import { describe, expect, it } from 'vitest';
import {
  ControlGate,
  LIVE_CONTROL,
  ReferenceAssembler,
  chunkReference,
  encodePacket,
  parseHostPacket,
  parseViewerPacket,
  type ViewerCommand,
  type ViewerPacket,
} from '@/modules/infra-mapping/domain/live-control';

const SID = 'infra-live-session-0001';
const TOKEN = 'a1b2c3d4e5f60718';

function packet(cmd: ViewerCommand, overrides: Partial<ViewerPacket> = {}): ViewerPacket {
  return { p: 'pf-infra', v: 1, sid: SID, c: TOKEN, n: 1, e: 0, cmd, ...overrides };
}

function wire(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe('viewer packet validation', () => {
  it('accepts a well formed command', () => {
    const parsed = parseViewerPacket(wire(packet({ t: 'pins', pins: [{ x: 0.1, y: 0.9 }] })));
    expect(parsed.ok).toBe(true);
  });

  it('rejects out-of-range points, too many points, extra fields and bad opacity', () => {
    for (const bad of [
      packet({ t: 'pins', pins: [{ x: 1.0001, y: 0.5 }] }),
      packet({ t: 'pins', pins: [{ x: -0.1, y: 0.5 }] }),
      packet({ t: 'pins', pins: Array.from({ length: 5 }, () => ({ x: 0.5, y: 0.5 })) }),
      packet({ t: 'opacity', value: 7 }),
      packet({ t: 'opacity', value: 0 }),
      { ...packet({ t: 'realign' }), extra: true },
      packet({ t: 'nudge', dir: 'sideways' as never }),
      packet({ t: 'realign' }, { sid: 'x' }),
      packet({ t: 'realign' }, { c: 'not-hex' }),
    ]) {
      expect(parseViewerPacket(wire(bad)).ok).toBe(false);
    }
  });

  it('rejects garbage, empty and oversized payloads', () => {
    expect(parseViewerPacket(new Uint8Array(0)).ok).toBe(false);
    expect(parseViewerPacket(new TextEncoder().encode('{nope')).ok).toBe(false);
    expect(parseViewerPacket(new Uint8Array(LIVE_CONTROL.maxPacketBytes + 1)).ok).toBe(false);
    expect(parseHostPacket(wire({ hello: 1 })).ok).toBe(false);
  });

  it('refuses to encode a packet that would not fit one reliable message', () => {
    const big = {
      p: 'pf-infra',
      v: 1,
      sid: SID,
      c: TOKEN,
      n: 1,
      e: 0,
      msg: { t: 'ref', id: 'r', i: 0, k: 1, d: 'a'.repeat(LIVE_CONTROL.chunkChars) },
    } as const;
    expect(encodePacket(big)).not.toBeNull();
    expect(encodePacket({ ...big, msg: { ...big.msg, d: 'a'.repeat(20_000) } })).toBeNull();
  });
});

describe('ControlGate (the broadcaster enforces the permission itself)', () => {
  function gate() {
    let counter = 0;
    return new ControlGate(SID, () => `00000000000000${(10 + counter++).toString(16).padStart(2, '0')}`);
  }

  it('refuses every command until control is approved', () => {
    const g = gate();
    expect(g.admit(packet({ t: 'pins', pins: [] }), 0)).toEqual({ ok: false, reason: 'disabled' });
    expect(g.admit(packet({ t: 'freeze', on: true }), 0)).toEqual({ ok: false, reason: 'disabled' });
    expect(g.admit(packet({ t: 'release' }), 0)).toEqual({ ok: false, reason: 'disabled' });
  });

  it('answers sync even while control is off (it only makes the broadcaster send its state)', () => {
    const g = gate();
    expect(g.admit(packet({ t: 'sync' }, { c: '', n: 0 }), 0)).toEqual({ ok: true });
  });

  it('refuses another session id', () => {
    const g = gate();
    g.enable();
    expect(g.admit(packet({ t: 'realign' }, { sid: 'infra-live-someone-else', c: g.currentToken }), 0)).toEqual({
      ok: false,
      reason: 'session',
    });
  });

  it('refuses a wrong or missing control token', () => {
    const g = gate();
    g.enable();
    expect(g.admit(packet({ t: 'realign' }, { c: '' }), 0)).toEqual({ ok: false, reason: 'token' });
    expect(g.admit(packet({ t: 'realign' }, { c: TOKEN }), 0)).toEqual({ ok: false, reason: 'token' });
  });

  it('accepts strictly increasing sequence numbers only (no replays, no duplicates)', () => {
    const g = gate();
    const token = g.enable();
    expect(g.admit(packet({ t: 'freeze', on: true }, { c: token, n: 1 }), 0).ok).toBe(true);
    expect(g.admit(packet({ t: 'freeze', on: false }, { c: token, n: 1 }), 0)).toEqual({ ok: false, reason: 'stale' });
    expect(g.admit(packet({ t: 'freeze', on: false }, { c: token, n: 0 }), 0)).toEqual({ ok: false, reason: 'stale' });
    expect(g.admit(packet({ t: 'freeze', on: false }, { c: token, n: 5 }), 0).ok).toBe(true);
    expect(g.acknowledged).toBe(5);
  });

  it('drops geometry made for an older picture shape, but not harmless settings', () => {
    const g = gate();
    const token = g.enable();
    expect(g.admit(packet({ t: 'pins', pins: [{ x: 0.5, y: 0.5 }] }, { c: token, n: 1, e: 3 }), 4)).toEqual({
      ok: false,
      reason: 'epoch',
    });
    expect(g.admit(packet({ t: 'nudge', dir: 'left' }, { c: token, n: 2, e: 3 }), 4)).toEqual({
      ok: false,
      reason: 'epoch',
    });
    expect(g.admit(packet({ t: 'opacity', value: 0.5 }, { c: token, n: 3, e: 3 }), 4).ok).toBe(true);
    expect(g.admit(packet({ t: 'pins', pins: [] }, { c: token, n: 4, e: 4 }), 4).ok).toBe(true);
  });

  it('a new token (viewer reconnected) kills the packets of the old connection', () => {
    const g = gate();
    const first = g.enable();
    expect(g.admit(packet({ t: 'realign' }, { c: first, n: 1 }), 0).ok).toBe(true);
    const second = g.rotate();
    expect(second).not.toBe(first);
    expect(g.acknowledged).toBe(0);
    expect(g.admit(packet({ t: 'realign' }, { c: first, n: 2 }), 0)).toEqual({ ok: false, reason: 'token' });
    expect(g.admit(packet({ t: 'realign' }, { c: second, n: 1 }), 0).ok).toBe(true);
  });

  it('withdrawing control stops everything at once', () => {
    const g = gate();
    const token = g.enable();
    g.disable();
    expect(g.isEnabled).toBe(false);
    expect(g.currentToken).toBe('');
    expect(g.admit(packet({ t: 'realign' }, { c: token, n: 9 }), 0)).toEqual({ ok: false, reason: 'disabled' });
  });
});

describe('small reference picture', () => {
  const jpeg = (size: number) => `data:image/jpeg;base64,${'A'.repeat(size)}`;

  it('splits and puts back together, in any order, ignoring repeats', () => {
    const url = jpeg(25_000);
    const chunks = chunkReference(url, 'ref1')!;
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.d.length).toBeLessThanOrEqual(LIVE_CONTROL.chunkChars);
    const assembler = new ReferenceAssembler();
    const order = [...chunks].reverse();
    let result: string | null = null;
    for (const chunk of [...order, order[0]!]) result = assembler.push(chunk) ?? result;
    expect(result).toBe(url);
  });

  it('does not complete while a piece is missing', () => {
    const chunks = chunkReference(jpeg(25_000), 'ref2')!;
    const assembler = new ReferenceAssembler();
    expect(assembler.push(chunks[0]!)).toBeNull();
  });

  it('only ever carries a small plain JPEG data URL', () => {
    expect(chunkReference('data:image/png;base64,AAAA', 'x')).toBeNull();
    expect(chunkReference('https://storage.example.com/private/photo.jpg', 'x')).toBeNull();
    expect(chunkReference('data:image/jpeg;base64,<script>', 'x')).toBeNull();
    expect(chunkReference(jpeg(LIVE_CONTROL.maxReferenceChars), 'x')).toBeNull();
  });
});
