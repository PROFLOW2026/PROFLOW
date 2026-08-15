import { describe, expect, it } from 'vitest';
import { punchPayloadFromFormData } from '@/modules/offline/domain/payloads';

describe('offline punch payload', () => {
  it('carries assignee, due date, and location from the punch form', () => {
    const form = new FormData();
    form.set('projectId', '11111111-1111-4111-8111-111111111111');
    form.set('title', 'Seal window');
    form.set('assigneeEmployeeId', '22222222-2222-4222-8222-222222222222');
    form.set('dueDate', '2026-08-20');
    form.set('location', 'Level 3 west');

    const payload = punchPayloadFromFormData(form);
    expect(payload.assigneeEmployeeId).toBe('22222222-2222-4222-8222-222222222222');
    expect(payload.dueDate).toBe('2026-08-20');
    expect(payload.location).toBe('Level 3 west');
  });
});
