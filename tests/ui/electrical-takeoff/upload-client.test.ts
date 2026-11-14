import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferTakeoffFileKind, uploadFileInChunks, validateTakeoffFile } from '@/modules/electrical-takeoff/ui/upload-client';

describe('takeoff upload-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates extension and size', () => {
    const ok = validateTakeoffFile(new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    expect(ok.ok).toBe(true);
    const bad = validateTakeoffFile(new File(['x'], 'plan.doc', { type: 'text/plain' }));
    expect(bad.ok).toBe(false);
  });

  it('infers kinds', () => {
    expect(inferTakeoffFileKind('a.DWG')).toBe('dwg');
    expect(inferTakeoffFileKind('a.dxf')).toBe('dxf');
  });

  it('uploads chunks sequentially', async () => {
    const data = new Uint8Array(300);
    const file = new File([data], 't.pdf', { type: 'application/pdf' });
  const calls: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const off = Number((init?.headers as Record<string, string>)['x-takeoff-offset']);
      calls.push(off);
      const next = off + 128;
      return {
        ok: true,
        json: async () => ({
          done: next >= file.size,
          nextOffset: Math.min(next, file.size),
          session: 'sess-1',
        }),
      };
    }),
  );

    const result = await uploadFileInChunks({
      file,
      fileId: 'fid',
      chunkBytes: 128,
      uploadBase: '/api/takeoff/upload',
    });
    expect(result.session).toBe('sess-1');
    expect(calls[0]).toBe(0);
    expect(calls.at(-1)).toBeGreaterThan(0);
  });
});