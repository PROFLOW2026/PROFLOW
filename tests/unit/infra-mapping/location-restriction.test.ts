/**
 * Contractor limited to specific units + level choice for multi-level units (pure checks, no database).
 */
import { describe, expect, it } from 'vitest';
import { allowedLocationSet, captureLevelChoices, visibleLocationSet } from '@/modules/infra-mapping/domain/location-scope';
import { externalGrantAllowsLocationPath } from '@/shared/external/context';

const node = (id: string, parentId: string | null, name = id, type = 'area') => ({
  id,
  parentId,
  name,
  type,
  archived: false,
});

describe('contractor location restriction', () => {
  const nodes = [
    node('b', null, 'בניין', 'building'),
    node('f1', 'b', 'קומה 1', 'floor'),
    node('u1', 'f1', 'דירה 1', 'apartment'),
    node('r1', 'u1', 'מטבח', 'room'),
    node('u2', 'f1', 'דירה 2', 'apartment'),
  ];

  it('unrestricted grants allow everything (null)', () => {
    expect(allowedLocationSet([{ allowedLocationIds: null }], nodes)).toBeNull();
    expect(allowedLocationSet([{ allowedLocationIds: [] }], nodes)).toBeNull();
    expect(allowedLocationSet([], nodes)).toBeNull();
  });

  it('a restricted grant reaches the unit and everything below it, not its siblings', () => {
    const allowed = allowedLocationSet([{ allowedLocationIds: ['u1'] }], nodes)!;
    expect([...allowed].sort()).toEqual(['r1', 'u1']);
    expect(visibleLocationSet(allowed, nodes).has('u2')).toBe(false);
    expect(visibleLocationSet(allowed, nodes).has('f1')).toBe(true);
  });

  it('any unrestricted grant wins over a restricted one', () => {
    expect(allowedLocationSet([{ allowedLocationIds: ['u1'] }, { allowedLocationIds: null }], nodes)).toBeNull();
  });

  it('grant check on a location path', () => {
    const grant = { allowedLocationIds: ['u1'] };
    expect(externalGrantAllowsLocationPath(grant, ['r1', 'u1', 'f1', 'b'])).toBe(true);
    expect(externalGrantAllowsLocationPath(grant, ['u2', 'f1', 'b'])).toBe(false);
    expect(externalGrantAllowsLocationPath(grant, undefined)).toBe(true);
    expect(externalGrantAllowsLocationPath({ allowedLocationIds: null }, ['u2'])).toBe(true);
  });
});

describe('captureLevelChoices', () => {
  const nodes = [
    node('b', null, 'בניין', 'building'),
    node('f1', 'b', 'קומה 1', 'floor'),
    node('f2', 'b', 'קומה 2', 'floor'),
    { ...node('duplex', 'f1', 'דופלקס', 'apartment'), extraLevelIds: ['f2'] },
    node('room', 'duplex', 'סלון', 'room'),
    node('single', 'f1', 'דירה', 'apartment'),
  ];

  it('offers the primary level first, then the extra ones, for a multi-level unit and its rooms', () => {
    expect(captureLevelChoices(nodes, 'duplex').map((c) => c.id)).toEqual(['f1', 'f2']);
    expect(captureLevelChoices(nodes, 'room').map((c) => c.id)).toEqual(['f1', 'f2']);
  });

  it('offers nothing for an ordinary unit or no location', () => {
    expect(captureLevelChoices(nodes, 'single')).toEqual([]);
    expect(captureLevelChoices(nodes, null)).toEqual([]);
  });
});
