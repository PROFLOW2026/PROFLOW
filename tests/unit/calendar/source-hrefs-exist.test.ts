import { describe, expect, it } from 'vitest';
import { CALENDAR_SOURCE_HREF_TEMPLATES } from '@/modules/calendar/domain/source-access';

describe('calendar source href templates (U08)', () => {
  it('matches CRM opportunity deep links', () => {
    const crm = CALENDAR_SOURCE_HREF_TEMPLATES.find((row) => row.kind === 'follow_up');
    expect(crm?.pattern.test('/crm/opportunities/550e8400-e29b-41d4-a716-446655440000')).toBe(
      true,
    );
    expect(crm?.pattern.test('/crm/550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('matches work task deep links', () => {
    const task = CALENDAR_SOURCE_HREF_TEMPLATES.find((row) => row.kind === 'task');
    expect(task?.pattern.test('/work?task=550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});
