import { getTranslations } from 'next-intl/server';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/shared/i18n/navigation';

type WorkforceTab = 'employees' | 'time' | 'attendance';

interface WorkforceSubNavProps {
  readonly active: WorkforceTab;
  readonly showAttendance?: boolean;
}

/** Local workforce tab strip — shell More nav is owned by Agent 8. */
export async function WorkforceSubNav({
  active,
  showAttendance = true,
}: WorkforceSubNavProps) {
  const t = await getTranslations('workforce');

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
      </TabsList>
    </Tabs>
  );
}
