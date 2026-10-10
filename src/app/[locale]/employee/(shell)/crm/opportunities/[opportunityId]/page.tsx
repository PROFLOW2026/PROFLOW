import { CrmOpportunityDetailView } from '@/modules/crm/ui/crm-opportunity-detail-view';

export default async function EmployeeOpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  return <CrmOpportunityDetailView opportunityId={opportunityId} surface="employee" />;
}
