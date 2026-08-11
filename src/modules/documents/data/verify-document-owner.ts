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
  vendors,
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
  } as const;

  const table = tableByOwnerType[ownerType];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, ownerId), eq(table.organizationId, organizationId)))
    .limit(1);

  return Boolean(row);
}
