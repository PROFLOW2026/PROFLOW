import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';

export default async function EmployeeAttendanceRedirectPage() {
  const locale = await getLocale();
  redirect({ href: '/employee/time', locale });
}
