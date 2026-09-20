import { describe, expect, it } from 'vitest';
import {
  containsVisibleSeedMarker,
  parseSeedAdminTaskRegistryKey,
  parseSeedTaskRegistryKey,
  seedAdminTaskRegistryKey,
  seedMeetingRegistryKey,
  seedTaskRegistryKey,
} from '../../../scripts/consultancy-demo/seed-registry-keys';

describe('consultancy demo seed registry', () => {
  it('builds stable internal keys', () => {
    expect(seedTaskRegistryKey('27015', 3)).toBe('task:27015:3');
    expect(seedAdminTaskRegistryKey(2)).toBe('admin-task:2');
    expect(seedMeetingRegistryKey(17)).toBe('meeting:17');
  });

  it('parses task and admin registry keys', () => {
    expect(parseSeedTaskRegistryKey('task:27015:3')).toEqual({ docNum: '27015', index: 3 });
    expect(parseSeedAdminTaskRegistryKey('admin-task:2')).toBe(2);
    expect(parseSeedTaskRegistryKey('meeting:1')).toBeNull();
  });

  it('detects visible seed marker leakage', () => {
    expect(containsVisibleSeedMarker('PF-CONSULTANCY-DEMO:task:1:2')).toBe(true);
    expect(containsVisibleSeedMarker('משימת פרויקט: תיאום לוחות')).toBe(false);
    expect(containsVisibleSeedMarker(null)).toBe(false);
  });
});
