import { getOrganizationReportsAnalytics } from '@/modules/financials';
import { ReportsAnalyticsView } from '@/modules/financials/ui';
import type { ReportsSection } from '@/modules/financials/domain/reports-section';
import { withOrgContext } from '@/shared/auth/session';

export async function ReportsAnalyticsLoader({
  workKindFilter,
  section,
}: {
  workKindFilter: string;
  section: ReportsSection | null;
}) {
  const analytics = await withOrgContext(async (context) =>
    getOrganizationReportsAnalytics(context, { workKindFilter }),
  );

  return <ReportsAnalyticsView analytics={analytics} focusSection={section} />;
}
