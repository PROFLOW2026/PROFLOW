import { describe, expect, it } from 'vitest';
import { cadTextCanvasPaint } from '@/modules/external-storage/ui/cad/pf-cad/cad-text-canvas-color';

describe('cadTextCanvasPaint', () => {
  it('decodes packed opaque black without treating alpha byte as CSS #RRGGBBAA', () => {
    const packed = (255 << 24) | 0x000000;
    const { fillStyle, globalAlpha } = cadTextCanvasPaint(packed);
    expect(globalAlpha).toBe(1);
    expect(fillStyle).not.toBe('#000000');
    expect(fillStyle).toMatch(/^#([0-9a-f]{2})\1\1$/i);
  });

  it('renders packed yellow opaque (was broken as transparent #ffffff00)', () => {
    const packed = (255 << 24) | 0xffff00;
    const { fillStyle, globalAlpha } = cadTextCanvasPaint(packed, { plotView: true });
    expect(globalAlpha).toBe(1);
    expect(fillStyle).toBe('#ffff00');
  });

  it('uses true RGB from packed gray and full opacity', () => {
    const packed = (255 << 24) | 0x404040;
    const plot = cadTextCanvasPaint(packed, { plotView: true });
    expect(plot.fillStyle).toBe('#404040');
    expect(plot.globalAlpha).toBe(1);
  });

  it('lifts low-contrast colors on Normal dark chrome', () => {
    const packed = (255 << 24) | 0x101014;
    const normal = cadTextCanvasPaint(packed, { plotView: false });
    expect(normal.fillStyle).not.toBe('#101014');
    expect(normal.globalAlpha).toBe(1);
  });
});
