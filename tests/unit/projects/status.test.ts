import { describe, expect, it } from 'vitest';
import { projectStatusShape } from '@/modules/projects';

describe('project status mapping', () => {
  it('maps every canonical status to a badge shape', () => {
    expect(projectStatusShape('draft')).toBe('draft');
    expect(projectStatusShape('active')).toBe('active');
    expect(projectStatusShape('on_hold')).toBe('onHold');
    expect(projectStatusShape('completed')).toBe('completed');
    expect(projectStatusShape('cancelled')).toBe('cancelled');
    expect(projectStatusShape('archived')).toBe('archived');
  });
});
