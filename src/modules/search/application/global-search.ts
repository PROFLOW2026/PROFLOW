import 'server-only';

import { ValidationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { GlobalSearchHit, GlobalSearchResult } from '../domain/types';
import {
  searchApBills,
  searchAssets,
  searchBillingRecords,
  searchBoqItems,
  searchClients,
  searchContacts,
  searchContracts,
  searchDailyLogs,
  searchDocuments,
  searchEmployees,
  searchExpenses,
  searchInspections,
  searchInventoryItems,
  searchMaterials,
  searchOpportunities,
  searchProjectsByWorkKind,
  searchPunchItems,
  searchPurchaseOrders,
  searchQuotes,
  searchSafetyRecords,
  searchSubcontracts,
  searchVendorCredits,
  searchVendors,
  searchWarrantyCoverages,
  searchCommunications,
  searchCalendarEvents,
  searchCloseouts,
} from '../data/search.repository';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { getModuleVisibility } from '@/modules/tenancy';
import { matchSearchCommands } from '../domain/commands';
import { groupSearchHits } from '../domain/group';
import { globalSearchSchema, type GlobalSearchInput } from '../validation/schemas';

/**
 * Org-scoped global search. Each kind is gated by its read permission.
 * Project-restricted users never see other projects' rows.
 * Hits never include Actual, profit, rates, OCR content, or BOQ prices.
 */
export async function globalSearch(
  context: OrgContext,
  rawInput: GlobalSearchInput,
): Promise<GlobalSearchResult> {
  const parsed = globalSearchSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const query = parsed.data.query;
  const limit = parsed.data.limitPerKind;
  const [accessibleProjectIds, modules] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getModuleVisibility(context),
  ]);
  const tasks: Promise<GlobalSearchHit[]>[] = [];

  if (hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
    tasks.push(
      searchProjectsByWorkKind(
        context.db,
        context.organizationId,
        query,
        'project',
        limit,
        accessibleProjectIds,
      ),
    );
    tasks.push(
      searchProjectsByWorkKind(
        context.db,
        context.organizationId,
        query,
        'job',
        limit,
        accessibleProjectIds,
      ),
    );
  }
  if (hasPermission(context, PERMISSIONS.SERVICE_READ)) {
    tasks.push(
      searchProjectsByWorkKind(
        context.db,
        context.organizationId,
        query,
        'work_order',
        limit,
        accessibleProjectIds,
      ),
    );
  }
  if (hasPermission(context, PERMISSIONS.CLIENTS_READ)) {
    tasks.push(searchClients(context.db, context.organizationId, query, limit));
    tasks.push(searchContacts(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.WORKFORCE_READ)) {
    tasks.push(searchEmployees(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.VENDORS_READ)) {
    tasks.push(searchVendors(context.db, context.organizationId, query, limit));
    tasks.push(
      searchSubcontracts(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    tasks.push(searchApBills(context.db, context.organizationId, query, limit, accessibleProjectIds));
    tasks.push(
      searchVendorCredits(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.BILLING_READ)) {
    tasks.push(
      searchBillingRecords(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.EXPENSES_READ)) {
    tasks.push(searchExpenses(context.db, context.organizationId, query, limit, accessibleProjectIds));
  }
  if (Boolean(modules.quotes) && hasPermission(context, PERMISSIONS.QUOTES_READ)) {
    tasks.push(searchQuotes(context.db, context.organizationId, query, limit));
  }
  if (Boolean(modules.crm) && hasPermission(context, PERMISSIONS.CRM_READ)) {
    tasks.push(searchOpportunities(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.CONTRACTS_READ)) {
    tasks.push(
      searchContracts(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (Boolean(modules.procurement) && hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) {
    tasks.push(
      searchPurchaseOrders(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    tasks.push(
      searchDocuments(context.db, context.organizationId, query, limit, {
        includeCompensation: hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ),
        accessibleProjectIds,
      }),
    );
  }
  if (hasPermission(context, PERMISSIONS.ASSETS_READ)) {
    tasks.push(searchAssets(context.db, context.organizationId, query, limit));
    tasks.push(searchInventoryItems(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.MATERIALS_READ)) {
    tasks.push(searchMaterials(context.db, context.organizationId, query, limit));
  }
  if (Boolean(modules.boq) && hasPermission(context, PERMISSIONS.BOQ_READ)) {
    tasks.push(searchBoqItems(context.db, context.organizationId, query, limit, accessibleProjectIds));
  }
  if (Boolean(modules.field_ops) && hasPermission(context, PERMISSIONS.FIELD_OPS_READ)) {
    tasks.push(searchDailyLogs(context.db, context.organizationId, query, limit, accessibleProjectIds));
    tasks.push(searchPunchItems(context.db, context.organizationId, query, limit, accessibleProjectIds));
    tasks.push(
      searchInspections(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (Boolean(modules.safety) && hasPermission(context, PERMISSIONS.SAFETY_READ)) {
    tasks.push(
      searchSafetyRecords(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
    tasks.push(
      searchWarrantyCoverages(
        context.db,
        context.organizationId,
        query,
        limit,
        accessibleProjectIds,
      ),
    );
    tasks.push(
      searchCloseouts(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.COMMUNICATIONS_READ)) {
    tasks.push(
      searchCommunications(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }
  if (hasPermission(context, PERMISSIONS.SCHEDULING_READ)) {
    tasks.push(
      searchCalendarEvents(context.db, context.organizationId, query, limit, accessibleProjectIds),
    );
  }

  const batches = await Promise.all(tasks);
  const hits = batches.flat();
  const commands = matchSearchCommands(query, context, modules);

  return {
    query,
    commands,
    groups: groupSearchHits(hits),
    hits,
  };
}
