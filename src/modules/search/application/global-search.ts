/**
 * Global Search — application layer dispatcher.
 *
 * Queries the kinds the dialog already lists, each capped and skipped when
 * the viewer lacks that kind's read permission. Commands come from the
 * existing create/open shortcuts.
 */
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { getAccessibleWorkspaceIds } from '@/modules/operations';
import { getModuleVisibility } from '@/modules/tenancy';
import {
  apBillSearchHref,
  billingRecordSearchHref,
  clientSearchHref,
  contractSearchHref,
  documentSearchHref,
  employeeSearchHref,
  quoteSearchHref,
  taskSearchHref,
  vendorSearchHref,
  workEntityHref,
} from '../domain/hrefs';
import { groupSearchHits } from '../domain/group';
import { matchSearchCommands } from '../domain/commands';
import {
  capSearchLimit,
  kindsVisibleToPermissions,
  type QueriedSearchKind,
} from '../domain/search-scope';
import type { GlobalSearchHit, GlobalSearchResult } from '../domain/types';
import {
  searchApBills,
  searchBillingRecords,
  searchClients,
  searchContracts,
  searchDocuments,
  searchEmployees,
  searchProjects,
  searchQuotes,
  searchTasks,
  searchVendors,
} from '../data/search.repository';

interface SearchScope {
  readonly accessibleProjectIds: string[] | null;
  readonly accessibleWorkspaceIds: readonly string[];
}

async function loadSearchScope(
  context: OrgContext,
  allowed: readonly QueriedSearchKind[],
): Promise<SearchScope> {
  const kinds = new Set(allowed);
  const needsProjects =
    kinds.has('project') || kinds.has('task') || kinds.has('contract') || kinds.has('document');
  const needsWorkspaces = kinds.has('task');

  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    needsProjects ? resolveAccessibleProjectIds(context) : Promise.resolve(null),
    needsWorkspaces
      ? getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId)
      : Promise.resolve([] as string[]),
  ]);

  return { accessibleProjectIds, accessibleWorkspaceIds };
}

async function fetchTaskHits(
  context: OrgContext,
  query: string,
  limit: number,
  scope?: SearchScope,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.TASKS_READ)) return [];

  const accessibleProjectIds = scope
    ? scope.accessibleProjectIds
    : await resolveAccessibleProjectIds(context);
  const accessibleWorkspaceIds = scope
    ? [...scope.accessibleWorkspaceIds]
    : await getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId);

  const hits = await searchTasks(
    context.db,
    context.organizationId,
    query,
    accessibleWorkspaceIds,
    accessibleProjectIds,
    limit,
  );

  return hits.map((hit): GlobalSearchHit => ({
    kind: 'task',
    id: hit.id,
    title: hit.title,
    subtitle: [hit.workspaceName, hit.projectName].filter(Boolean).join(' · ') || null,
    href: taskSearchHref(hit.id),
    status: hit.status,
    contextLabel: hit.projectName ?? hit.workspaceName ?? null,
    date: hit.dueDate,
  }));
}

async function fetchProjectHits(
  context: OrgContext,
  query: string,
  limit: number,
  scope?: SearchScope,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return [];

  const accessibleProjectIds = scope
    ? scope.accessibleProjectIds
    : await resolveAccessibleProjectIds(context);
  const hits = await searchProjects(
    context.db,
    context.organizationId,
    query,
    accessibleProjectIds,
    limit,
  );

  return hits.map((hit): GlobalSearchHit => ({
    kind: 'project',
    id: hit.id,
    title: hit.displayName,
    subtitle: hit.clientName,
    href: workEntityHref('project', hit.id),
    status: hit.status,
    contextLabel: hit.documentNumber,
    date: null,
  }));
}

async function fetchClientHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.CLIENTS_READ)) return [];
  const hits = await searchClients(context.db, context.organizationId, query, limit);
  return hits.map((hit) => ({
    kind: 'client' as const,
    id: hit.id,
    title: hit.name,
    subtitle: hit.subtitle,
    href: clientSearchHref(hit.id),
    status: hit.status,
  }));
}

async function fetchVendorHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.VENDORS_READ)) return [];
  const hits = await searchVendors(context.db, context.organizationId, query, limit);
  return hits.map((hit) => ({
    kind: 'vendor' as const,
    id: hit.id,
    title: hit.name,
    subtitle: hit.subtitle,
    href: vendorSearchHref(hit.id),
    status: hit.status,
  }));
}

async function fetchBillingHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return [];
  const hits = await searchBillingRecords(context.db, context.organizationId, query, limit);
  return hits.map((hit) => {
    const reference = hit.reference?.trim() || null;
    return {
      kind: 'billing' as const,
      id: hit.id,
      title: reference || hit.clientName || hit.status,
      subtitle: reference ? hit.clientName : null,
      href: billingRecordSearchHref(hit.id),
      status: hit.status,
      date: hit.issueDate,
      amount: hit.totalAmount,
      currency: hit.currency,
    };
  });
}

async function fetchApBillHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.AP_READ)) return [];
  const hits = await searchApBills(context.db, context.organizationId, query, limit);
  return hits.map((hit) => {
    const reference = hit.reference?.trim() || null;
    return {
      kind: 'bill' as const,
      id: hit.id,
      title: reference || hit.vendorName,
      subtitle: reference ? hit.vendorName : null,
      href: apBillSearchHref(hit.id),
      status: hit.status,
      date: hit.billDate,
      amount: hit.totalAmount,
      currency: hit.currency,
    };
  });
}

async function fetchQuoteHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.QUOTES_READ)) return [];
  const hits = await searchQuotes(context.db, context.organizationId, query, limit);
  return hits.map((hit) => ({
    kind: 'quote' as const,
    id: hit.id,
    title: hit.title,
    subtitle: hit.clientName,
    href: quoteSearchHref(hit.id),
    status: hit.status,
    date: hit.validityDate,
    amount: hit.totalAmount,
    currency: hit.totalAmount ? hit.currency : null,
  }));
}

async function fetchDocumentHits(
  context: OrgContext,
  query: string,
  limit: number,
  scope: SearchScope,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return [];
  const hits = await searchDocuments(
    context.db,
    context.organizationId,
    query,
    scope.accessibleProjectIds,
    hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ),
    limit,
  );
  return hits.map((hit) => ({
    kind: 'document' as const,
    id: hit.id,
    title: hit.originalFilename,
    subtitle: hit.category,
    href: documentSearchHref(hit.originalFilename),
    status: hit.status,
  }));
}

async function fetchEmployeeHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.WORKFORCE_READ)) return [];
  const hits = await searchEmployees(context.db, context.organizationId, query, limit);
  return hits.map((hit) => ({
    kind: 'employee' as const,
    id: hit.id,
    title: hit.name,
    subtitle: hit.jobTitle,
    href: employeeSearchHref(hit.id),
    status: hit.status,
    contextLabel: hit.employeeNumber,
  }));
}

async function fetchContractHits(
  context: OrgContext,
  query: string,
  limit: number,
  scope: SearchScope,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.CONTRACTS_READ)) return [];
  const hits = await searchContracts(
    context.db,
    context.organizationId,
    query,
    scope.accessibleProjectIds,
    limit,
  );
  return hits.map((hit) => ({
    kind: 'contract' as const,
    id: hit.id,
    title: hit.name?.trim() || hit.contractNumber || hit.reference || hit.status,
    subtitle: hit.projectName,
    href: contractSearchHref(hit.projectId),
    status: hit.status,
    contextLabel: hit.contractNumber,
  }));
}

async function fetchAllowedHits(
  context: OrgContext,
  query: string,
  limit: number,
  allowed: readonly QueriedSearchKind[],
  scope: SearchScope,
): Promise<GlobalSearchHit[]> {
  const kinds = new Set(allowed);
  const jobs: Promise<GlobalSearchHit[]>[] = [];

  if (kinds.has('client')) jobs.push(fetchClientHits(context, query, limit));
  if (kinds.has('vendor')) jobs.push(fetchVendorHits(context, query, limit));
  if (kinds.has('project')) jobs.push(fetchProjectHits(context, query, limit, scope));
  if (kinds.has('task')) jobs.push(fetchTaskHits(context, query, limit, scope));
  if (kinds.has('billing')) jobs.push(fetchBillingHits(context, query, limit));
  if (kinds.has('bill')) jobs.push(fetchApBillHits(context, query, limit));
  if (kinds.has('quote')) jobs.push(fetchQuoteHits(context, query, limit));
  if (kinds.has('document')) jobs.push(fetchDocumentHits(context, query, limit, scope));
  if (kinds.has('employee')) jobs.push(fetchEmployeeHits(context, query, limit));
  if (kinds.has('contract')) jobs.push(fetchContractHits(context, query, limit, scope));

  const lists = await Promise.all(jobs);
  return lists.flat();
}

/**
 * Global search dispatcher.
 * Compatible with existing `search-actions.ts` call: `globalSearch(context, { query })`.
 */
export async function globalSearch(
  context: OrgContext,
  input: { query: string; limit?: number },
): Promise<GlobalSearchResult> {
  const query = input.query?.trim() ?? '';
  if (!query) {
    return { query: '', commands: [], groups: [], hits: [] };
  }

  const limit = capSearchLimit(input.limit);
  const allowed = kindsVisibleToPermissions(context.permissions);

  const [modules, scope] = await Promise.all([
    getModuleVisibility(context),
    loadSearchScope(context, allowed),
  ]);

  const [commands, hits] = await Promise.all([
    Promise.resolve(matchSearchCommands(query, context, modules)),
    fetchAllowedHits(context, query, limit, allowed, scope),
  ]);

  return {
    query,
    commands,
    groups: groupSearchHits(hits, null),
    hits,
  };
}

/**
 * Search tasks only (used by task-specific search UIs and operations dashboard).
 * Access rules enforced identically to globalSearch task branch.
 */
export async function searchTasksOnly(
  context: OrgContext,
  query: string,
  limit = 20,
): Promise<GlobalSearchHit[]> {
  if (!query.trim()) return [];
  return fetchTaskHits(context, query, limit);
}

export type { GlobalSearchResult, GlobalSearchHit } from '../domain/types';
