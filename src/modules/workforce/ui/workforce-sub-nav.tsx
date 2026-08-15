import { getTranslations } from 'next-intl/server';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

type WorkforceTab = 'employees' | 'time' | 'attendance' | 'approvals';

interface WorkforceSubNavProps {
  readonly active: WorkforceTab;
}

/** Local workforce tab strip — shell More nav is owned by Agent 8. */
export async function WorkforceSubNav({ active }: WorkforceSubNavProps) {
  const t = await getTranslations('workforce');
  const { showAttendance, showApprovals } = await withOrgContext(async (context) => ({
    showAttendance: hasAnyPermission(context, [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_SELF,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ]),
    showApprovals: hasPermission(context, PERMISSIONS.TIME_APPROVE),
  }));

  return (
    <Tabs value={active}>
      <TabsList>
        <TabsTrigger value="employees" asChild>
          <Link href="/workforce/employees">{t('nav.employees')}</Link>
        </TabsTrigger>
        <TabsTrigger value="time" asChild>
          <Link href="/workforce/time">{t('nav.time')}</Link>
        </TabsTrigger>
        {showAttendance ? (
          <TabsTrigger value="attendance" asChild>
            <Link href="/workforce/attendance">{t('nav.attendance')}</Link>
          </TabsTrigger>
        ) : null}
        {showApprovals ? (
          <TabsTrigger value="approvals" asChild>
            <Link href="/workforce/time/approvals">{t('nav.approvals')}</Link>
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
}
