import { getOrganizationReportsAnalytics } from '@/modules/financials';
import { ReportsAnalyticsView } from '@/modules/financials/ui';
import type { ReportsSection } from '@/modules/financials/domain/reports-section';
import { withOrgContext } from '@/shared/auth/session';

export async function ReportsAnalyticsLoader({
  workKindFilter,
  section,
  fromDate,
  toDate,
}: {
  workKindFilter: string;
  section: ReportsSection | null;
  fromDate?: string;
  toDate?: string;
}) {
  const analytics = await withOrgContext(async (context) =>
    getOrganizationReportsAnalytics(context, { workKindFilter, fromDate, toDate }),
  );

  return <ReportsAnalyticsView analytics={analytics} focusSection={section} />;
}
