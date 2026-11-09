import { describe, expect, it } from 'vitest';
import { measureLengthMeters, pointDistance } from '@/modules/project-plans/domain/sheet-measure';

describe('sheet measure length', () => {
  it('length = distance(p1,p2) * scale', () => {
    const p1: [number, number] = [0, 0];
    const p2: [number, number] = [3, 4];
    const scale = 2;
    expect(pointDistance(p1, p2)).toBe(5);
    expect(measureLengthMeters([p1, p2], scale)).toBe(10);
  });
});
