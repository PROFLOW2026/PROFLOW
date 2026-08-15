import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function WorkforcePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const href = await withOrgContext(async (context) => {
    if (hasPermission(context, PERMISSIONS.WORKFORCE_READ)) return '/workforce/employees';
    if (hasPermission(context, PERMISSIONS.TIME_MANAGE)) return '/workforce/time';
    if (
      hasAnyPermission(context, [
        PERMISSIONS.ATTENDANCE_SELF,
        PERMISSIONS.ATTENDANCE_READ,
        PERMISSIONS.ATTENDANCE_MANAGE,
      ])
    ) {
      return '/workforce/attendance';
    }
    return '/workforce/employees';
  });
  redirect({ href, locale });
}
