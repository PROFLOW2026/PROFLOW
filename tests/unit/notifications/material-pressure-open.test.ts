import { describe, expect, it } from 'vitest';
import { notificationOpenMarksRead } from '@/modules/notifications/ui/notification-panel';

describe('material pressure alert open behavior', () => {
  it('does not mark a material alert read when it is opened', () => {
    expect(notificationOpenMarksRead('material_pressure_alert')).toBe(false);
  });

  it('still marks every other notification read when it is opened', () => {
    expect(notificationOpenMarksRead('billing_overdue')).toBe(true);
    expect(notificationOpenMarksRead('task_assigned_to_you')).toBe(true);
    expect(notificationOpenMarksRead('action_required')).toBe(true);
  });
});
