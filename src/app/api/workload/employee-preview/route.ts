import { NextResponse, type NextRequest } from 'next/server';
import { getEmployeeTaskPreview } from '@/modules/tasks/application/get-team-workload';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';

/**
 * GET /api/workload/employee-preview?employeeId=<uuid>
 *
 * Returns the top 5 overdue/due-soon tasks for the given employee.
 * Requires workload.read permission.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const employeeId = searchParams.get('employeeId');

  if (!employeeId || !/^[0-9a-f-]{36}$/.test(employeeId)) {
    return NextResponse.json({ error: 'Invalid employeeId' }, { status: 400 });
  }

  try {
    const tasks = await withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.WORKLOAD_READ)) {
        return null;
      }
      return getEmployeeTaskPreview(context, employeeId);
    });

    if (tasks === null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
