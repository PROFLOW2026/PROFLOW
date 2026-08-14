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
  searchDocuments,
  searchEmployees,
  searchProjectsByWorkKind,
  searchVendors,
} from '../data/search.repository';
import { globalSearchSchema, type GlobalSearchInput } from '../validation/schemas';

/**
 * Org-scoped global search. Each kind is gated by its read permission.
 * Text/select custom field values are included under that same parent-entity
 * permission (`custom_fields.manage` is not required). Hits still return the
 * entity title/subtitle — never Actual, profit, rates, money custom values,
 * or BOQ prices.
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
  const tasks: Promise<GlobalSearchHit[]>[] = [];

  if (hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
    tasks.push(searchProjectsByWorkKind(context.db, context.organizationId, query, 'project', limit));
    tasks.push(searchProjectsByWorkKind(context.db, context.organizationId, query, 'job', limit));
  }
  // Work orders are the same economic entity but gated by service.read (not projects.read).
  if (hasPermission(context, PERMISSIONS.SERVICE_READ)) {
    tasks.push(
      searchProjectsByWorkKind(context.db, context.organizationId, query, 'work_order', limit),
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
  }
  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    tasks.push(searchApBills(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.BILLING_READ)) {
    tasks.push(searchBillingRecords(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    tasks.push(searchDocuments(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.ASSETS_READ)) {
    tasks.push(searchAssets(context.db, context.organizationId, query, limit));
  }
  if (hasPermission(context, PERMISSIONS.BOQ_READ)) {
    tasks.push(searchBoqItems(context.db, context.organizationId, query, limit));
  }

  const batches = await Promise.all(tasks);
  const hits = batches.flat();

  return { query, hits };
}
