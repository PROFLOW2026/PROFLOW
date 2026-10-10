import { describe, expect, it } from 'vitest';
import { mapEmployeePmTaskToCardData } from '@/modules/employee-app/application/map-employee-pm-task-card';

describe('mapEmployeePmTaskToCardData', () => {
  it('maps approvalRequired from task summary', () => {
    const card = mapEmployeePmTaskToCardData({
      id: 't1',
      title: 'Review',
      description: null,
      status: 'in_progress',
      priority: 'medium',
      dueDate: null,
      projectId: 'p1',
      approvalRequired: true,
    });
    expect(card.approvalRequired).toBe(true);
  });
});
