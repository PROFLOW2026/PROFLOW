import { CrmNewOpportunityView } from '@/modules/crm/ui/crm-new-opportunity-view';
import { employeeCreateOpportunityAction } from '../../actions';

export default async function EmployeeNewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const params = await searchParams;
  return (
    <CrmNewOpportunityView
      surface="employee"
      searchParams={params}
      createOpportunityAction={employeeCreateOpportunityAction}
    />
  );
}
