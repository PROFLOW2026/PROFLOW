'use server';

import { withOrgContext } from '@/shared/auth/session';
import { listEmployeePmTaskAssigneeOptions } from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';

export async function loadEmployeeTaskAssigneeOptionsAction(projectId: string) {
  return withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    const options = await listEmployeePmTaskAssigneeOptions(context, projectId);
    return options.map((option) => ({
      key: option.key,
      displayName: option.name,
      jobTitle: option.jobTitle,
    }));
  });
}
