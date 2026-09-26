/**
 * Storage and statutory connection attention for Today.
 * Queries live in command-center so settings failures surface as actions.
 */

import { and, eq } from 'drizzle-orm';
import {
  billingRecords,
  externalInvoicingProviderConnections,
  externalStatutoryDocuments,
  organizationStorageConnections,
  projects,
} from '@drizzle/schema';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withItemDefaults } from '../domain/ranking';
import { fallbackWhere, statutoryAmbiguousCopy, statutoryConnectionCopy, statutoryUnsupportedCopy, storageAttentionCopy } from '../domain/item-copy';
import type { CommandCenterItem } from '../domain/types';
import type { CollectContext } from './collect-sources';

const ATTENTION_CAP = 15;

const PROVISION_FAILURE_PREFIXES = [
  'provision_chain_deferred',
  'provision_failed',
  'provision_kick_failed',
  'provision:',
] as const;

export function storageLastErrorIsProvisionFailure(lastError: string | null | undefined): boolean {
  const value = lastError?.trim() ?? '';
  if (!value) return false;
  return PROVISION_FAILURE_PREFIXES.some((prefix) => value === prefix || value.startsWith(prefix));
}

export function storageConnectionNeedsAttention(input: {
  readonly status: string;
  readonly lastError: string | null;
}): boolean {
  if (input.status === 'error' || input.status === 'reconnect_required') return true;
  return storageLastErrorIsProvisionFailure(input.lastError);
}

function storageAttentionReason(
  status: string,
): 'reconnect_required' | 'error' | 'provision' {
  if (status === 'reconnect_required') return 'reconnect_required';
  if (status === 'error') return 'error';
  return 'provision';
}

export async function collectStorageAttention(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.INTEGRATIONS_READ)) return [];

  try {
    const rows = await ctx.context.db
      .select({
        id: organizationStorageConnections.id,
        provider: organizationStorageConnections.provider,
        status: organizationStorageConnections.status,
        lastError: organizationStorageConnections.lastError,
        externalAccountName: organizationStorageConnections.externalAccountName,
      })
      .from(organizationStorageConnections)
      .where(eq(organizationStorageConnections.organizationId, ctx.context.organizationId));

    const items: CommandCenterItem[] = [];
    for (const row of rows) {
      if (items.length >= ATTENTION_CAP) break;
      if (!storageConnectionNeedsAttention({ status: row.status, lastError: row.lastError })) {
        continue;
      }
      const reason = storageAttentionReason(row.status);
      const copy = storageAttentionCopy(ctx.copyScope, { provider: row.provider, reason });
      items.push(
        withItemDefaults({
          sourceType: 'storage_attention',
          sourceId: row.id,
          what: copy.what,
          why: copy.why,
          where: row.externalAccountName?.trim() || fallbackWhere(ctx.copyScope, 'storage'),
          href: '/settings/storage',
        }),
      );
    }
    return items;
  } catch {
    return [];
  }
}

export async function collectStatutoryAttention(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (
    !hasAnyPermission(ctx.context, [PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE])
  ) {
    return [];
  }

  try {
    const items: CommandCenterItem[] = [];

    const connections = await ctx.context.db
      .select({
        id: externalInvoicingProviderConnections.id,
        status: externalInvoicingProviderConnections.status,
      })
      .from(externalInvoicingProviderConnections)
      .where(
        and(
          eq(externalInvoicingProviderConnections.organizationId, ctx.context.organizationId),
          eq(externalInvoicingProviderConnections.status, 'error'),
        ),
      )
      .limit(1);

    const connection = connections[0];
    if (connection) {
      const copy = statutoryConnectionCopy(ctx.copyScope);
      items.push(
        withItemDefaults({
          sourceType: 'statutory_attention',
          sourceId: connection.id,
          what: copy.what,
          why: copy.why,
          where: fallbackWhere(ctx.copyScope, 'integrations'),
          href: '/settings/integrations',
        }),
      );
    }

    const docs = await ctx.context.db
      .select({
        billingRecordId: externalStatutoryDocuments.billingRecordId,
        reference: billingRecords.reference,
        projectName: projects.name,
      })
      .from(externalStatutoryDocuments)
      .innerJoin(
        billingRecords,
        and(
          eq(billingRecords.id, externalStatutoryDocuments.billingRecordId),
          eq(billingRecords.organizationId, externalStatutoryDocuments.organizationId),
        ),
      )
      .leftJoin(projects, eq(projects.id, billingRecords.projectId))
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, ctx.context.organizationId),
          eq(externalStatutoryDocuments.issuanceOutcome, 'ambiguous'),
        ),
      )
      .limit(ATTENTION_CAP);

    const unsupported = await ctx.context.db
      .select({
        billingRecordId: externalStatutoryDocuments.billingRecordId,
        reference: billingRecords.reference,
        projectName: projects.name,
      })
      .from(externalStatutoryDocuments)
      .innerJoin(
        billingRecords,
        and(
          eq(billingRecords.id, externalStatutoryDocuments.billingRecordId),
          eq(billingRecords.organizationId, externalStatutoryDocuments.organizationId),
        ),
      )
      .leftJoin(projects, eq(projects.id, billingRecords.projectId))
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, ctx.context.organizationId),
          eq(externalStatutoryDocuments.lastErrorCode, 'unsupported'),
        ),
      )
      .limit(ATTENTION_CAP);

    const seenBilling = new Set<string>();
    for (const row of docs) {
      if (items.length >= ATTENTION_CAP) break;
      if (seenBilling.has(row.billingRecordId)) continue;
      seenBilling.add(row.billingRecordId);
      const copy = statutoryAmbiguousCopy(ctx.copyScope, { reference: row.reference });
      items.push(
        withItemDefaults({
          sourceType: 'statutory_attention',
          sourceId: row.billingRecordId,
          what: copy.what,
          why: copy.why,
          where: row.projectName?.trim() || fallbackWhere(ctx.copyScope, 'billing'),
          href: `/billing/${row.billingRecordId}`,
        }),
      );
    }

    for (const row of unsupported) {
      if (items.length >= ATTENTION_CAP) break;
      if (seenBilling.has(row.billingRecordId)) continue;
      seenBilling.add(row.billingRecordId);
      const copy = statutoryUnsupportedCopy(ctx.copyScope, { reference: row.reference });
      items.push(
        withItemDefaults({
          sourceType: 'statutory_attention',
          sourceId: row.billingRecordId,
          what: copy.what,
          why: copy.why,
          where: row.projectName?.trim() || fallbackWhere(ctx.copyScope, 'billing'),
          href: `/billing/${row.billingRecordId}`,
        }),
      );
    }

    return items;
  } catch {
    return [];
  }
}
