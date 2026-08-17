import { and, eq } from 'drizzle-orm';
import {
  approvals,
  apBills,
  assets,
  billingRecords,
  changeOrders,
  changeRequests,
  clients,
  complianceArtifacts,
  contracts,
  dailyLogs,
  employees,
  expenses,
  formSubmissions,
  inspections,
  inventoryItems,
  procurementRfqs,
  projects,
  punchListItems,
  purchaseOrders,
  quoteVersions,
  safetyRecords,
  subcontractAgreements,
  timesheets,
  vendors,
  calendarEvents,
  outboundCommunications,
  projectCloseouts,
  warrantyCoverages,
  warrantyIssues,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DocumentOwnerType } from '../domain/types';

export async function documentOwnerExistsInOrganization(
  db: DbExecutor,
  organizationId: string,
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<boolean> {
  if (ownerType === 'organization') {
    return ownerId === organizationId;
  }

  if (ownerType === 'work_order') {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, ownerId),
          eq(projects.organizationId, organizationId),
          eq(projects.workKind, 'work_order'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  const tableByOwnerType = {
    project: projects,
    client: clients,
    vendor: vendors,
    expense: expenses,
    change_request: changeRequests,
    change_order: changeOrders,
    approval: approvals,
    billing_record: billingRecords,
    quote_version: quoteVersions,
    employee: employees,
    procurement_rfq: procurementRfqs,
    purchase_order: purchaseOrders,
    ap_bill: apBills,
    daily_log: dailyLogs,
    punch_list_item: punchListItems,
    inspection: inspections,
    compliance_artifact: complianceArtifacts,
    asset: assets,
    inventory_item: inventoryItems,
    form_submission: formSubmissions,
    contract: contracts,
    subcontract_agreement: subcontractAgreements,
    safety_record: safetyRecords,
    timesheet: timesheets,
    warranty_coverage: warrantyCoverages,
    warranty_issue: warrantyIssues,
    closeout: projectCloseouts,
    outbound_communication: outboundCommunications,
    calendar_event: calendarEvents,
  } as const;

  const table = tableByOwnerType[ownerType];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, ownerId), eq(table.organizationId, organizationId)))
    .limit(1);

  return Boolean(row);
}
