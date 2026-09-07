'use client';

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { attendanceEmployeeSearchHref } from '@/modules/workforce/domain/attendance-canonical-employee';

interface AttendanceEmployeeContextProps {
  readonly canonicalEmployeeId: string | null;
  readonly searchParams: string;
  readonly children: (input: {
    readonly employeeId: string;
    readonly onEmployeeChange: (employeeId: string) => void;
  }) => ReactNode;
}

/**
 * Keeps attendance forms bound to the URL `employeeId` search param.
 * Changing employee in any child updates canonical page context in place.
 */
export function AttendanceEmployeeContext({
  canonicalEmployeeId,
  searchParams,
  children,
}: AttendanceEmployeeContextProps) {
  const router = useRouter();
  const pathname = usePathname();

  const onEmployeeChange = useCallback(
    (employeeId: string) => {
      const current = new URLSearchParams(searchParams);
      router.replace(attendanceEmployeeSearchHref(pathname, current, employeeId), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (!canonicalEmployeeId) {
    return null;
  }

  return children({ employeeId: canonicalEmployeeId, onEmployeeChange });
}
