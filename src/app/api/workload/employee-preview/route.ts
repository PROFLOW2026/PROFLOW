import { NextResponse, type NextRequest } from 'next/server';
import { getEmployeeTaskPreview } from '@/modules/tasks/application/get-team-workload';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { localeFromCookieValue } from '@/shared/i18n/bare-path';
import { createNamespaceTranslator } from '@/shared/i18n/namespace-translator';

/**
 * GET /api/workload/employee-preview?employeeId=<uuid>
 *
 * Returns the top 5 overdue/due-soon tasks for the given employee.
 * Requires workload.read permission.
 */
export async function GET(request: NextRequest) {
  const locale = localeFromCookieValue(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const t = await createNamespaceTranslator(locale, 'settings');

  const { searchParams } = request.nextUrl;
  const employeeId = searchParams.get('employeeId');

  if (!employeeId || !/^[0-9a-f-]{36}$/.test(employeeId)) {
    return NextResponse.json(
      { error: t('workflowActions.workloadApi.invalidEmployeeId') },
      { status: 400 },
    );
  }

  try {
    const tasks = await withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.WORKLOAD_READ)) {
        return null;
      }
      return getEmployeeTaskPreview(context, employeeId);
    });

    if (tasks === null) {
      return NextResponse.json(
        { error: t('workflowActions.workloadApi.forbidden') },
        { status: 403 },
      );
    }

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json(
      { error: t('workflowActions.workloadApi.internalError') },
      { status: 500 },
    );
  }
}
