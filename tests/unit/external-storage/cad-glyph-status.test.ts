import { describe, expect, it } from 'vitest';
import {
  mayMarkTextGpu,
  shouldDrawTextOnCanvas,
  type GpuHandoffText,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';

function text(partial: Partial<GpuHandoffText> = {}): GpuHandoffText {
  return {
    x: 0,
    y: 0,
    h: 2.5,
    r: 0,
    c: 0xffffff,
    layer: 0,
    t: 'ABC',
    ...partial,
  };
}

describe('cad glyph status handoff', () => {
  it('draws MISSING records on Canvas even when gpu is set', () => {
    expect(shouldDrawTextOnCanvas(text({ gpu: true, glyphStatus: 'MISSING' }))).toBe(true);
  });

  it('skips Canvas for RESOLVED gpu text', () => {
    expect(shouldDrawTextOnCanvas(text({ gpu: true, glyphStatus: 'RESOLVED' }))).toBe(false);
  });

  it('keeps Canvas when gpu is omitted or false', () => {
    expect(shouldDrawTextOnCanvas(text())).toBe(true);
    expect(shouldDrawTextOnCanvas(text({ gpu: false, glyphStatus: 'RESOLVED' }))).toBe(true);
  });

  it('allows an explicit SUBSTITUTED fallback on GPU for non-Hebrew text', () => {
    expect(shouldDrawTextOnCanvas(text({ gpu: true, glyphStatus: 'SUBSTITUTED' }))).toBe(false);
  });

  it('keeps Hebrew SHX on Canvas when the face was only substituted', () => {
    expect(
      shouldDrawTextOnCanvas(text({ t: 'שלום', gpu: true, glyphStatus: 'SUBSTITUTED' })),
    ).toBe(true);
  });

  it('does not treat a short segment buffer as a complete record', () => {
    expect(mayMarkTextGpu(0, 3)).toBe(false);
    expect(mayMarkTextGpu(3, 3)).toBe(true);
  });
});
