import { describe, expect, it } from 'vitest';
import { buildWebManifest } from '@/modules/offline/domain/web-manifest';

describe('web manifest locale', () => {
  it('uses different descriptions per locale', () => {
    const he = buildWebManifest('he-IL').description;
    const en = buildWebManifest('en').description;
    expect(he).not.toBe(en);
    expect(he.length).toBeGreaterThan(10);
    expect(en.length).toBeGreaterThan(10);
  });
});
