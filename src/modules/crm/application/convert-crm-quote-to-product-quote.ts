/**
 * Task 1: CRM Sales Quote → Product Quote conversion.
 *
 * After winning a CRM bid (crm_sales_quotes), this action pre-populates a draft
 * product quote (estimates) from the accepted (or latest) CRM version's line items
 * so the owner does not have to re-enter all lines manually.
 *
 * Business rules (from owner):
 * - CRM quote total is NOT the final contract amount — all amounts remain editable.
 * - Creates the product quote in DRAFT state; never auto-issues or auto-approves.
 * - The caller should redirect to the new product quote for review / editing.
 * - Idempotent: a second convert returns the existing product quote (U04).
 */

import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db/client';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { createQuote } from '@/modules/quotes/application/manage-quotes';
import { findProductQuoteBySourceCrmQuoteId } from '@/modules/quotes';
import { findOpportunityById } from '../data/crm.repository';
import {
  findSalesQuoteVersionById,
  listSalesQuoteLines,
  listSalesQuoteVersions,
  lockSalesQuoteForUpdate,
} from '../data/crm.repository';
import { CRM_AUDIT_ACTIONS } from '../domain/types';

export interface ConvertCrmQuoteInput {
  /** The CRM sales quote to convert. */
  readonly salesQuoteId: string;
  /**
   * Optional title override for the new product quote.
   * Defaults to the CRM quote title with a "(from CRM)" suffix.
   */
  readonly titleOverride?: string;
}

export interface ConvertCrmQuoteResult {
  /** The product quote id (estimates table). */
  readonly productQuoteId: string;
  /** False when an active product quote already existed for this CRM quote. */
  readonly created: boolean;
}

/**
 * Converts a CRM sales quote into a draft product quote.
 *
 * Requires: CRM_MANAGE + QUOTES_MANAGE permissions.
 */
export async function convertCrmQuoteToProductQuote(
  context: OrgContext,
  input: ConvertCrmQuoteInput,
): Promise<ConvertCrmQuoteResult> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);

  return withTransaction(context.db, async (tx) => {
    const txContext: OrgContext = { ...context, db: tx };

    const salesQuote = await lockSalesQuoteForUpdate(
      tx,
      context.organizationId,
      input.salesQuoteId,
    );
    if (!salesQuote) throw new NotFoundError('CRM sales quote');

    if (salesQuote.status === 'cancelled') {
      throw new DomainRuleError(
        'Cannot convert a cancelled CRM sales quote',
        'crm.errors.quoteConversionCancelled',
      );
    }

    const existing = await findProductQuoteBySourceCrmQuoteId(
      tx,
      context.organizationId,
      salesQuote.id,
    );
    if (existing) {
      return { productQuoteId: existing.id, created: false };
    }

    // Prefer accepted version; fall back to the most recent (version_number DESC).
    let versionId: string;
    if (salesQuote.acceptedVersionId) {
      versionId = salesQuote.acceptedVersionId;
    } else {
      const versions = await listSalesQuoteVersions(tx, context.organizationId, salesQuote.id);
      if (versions.length === 0) {
        throw new DomainRuleError(
          'CRM sales quote has no versions to convert',
          'crm.errors.quoteNoVersions',
        );
      }
      const latestVersion = [...versions].sort(
        (a, b) => b.versionNumber - a.versionNumber,
      )[0]!;
      versionId = latestVersion.id;
    }

    const version = await findSalesQuoteVersionById(tx, context.organizationId, versionId);
    if (!version) throw new NotFoundError('CRM sales quote version');

    const crmLines = await listSalesQuoteLines(tx, context.organizationId, versionId);

    if (crmLines.length === 0) {
      throw new DomainRuleError(
        'CRM sales quote version has no line items to convert',
        'crm.errors.quoteNoLines',
      );
    }

    const opportunity = await findOpportunityById(
      tx,
      context.organizationId,
      salesQuote.opportunityId,
    );
    const clientId = opportunity?.convertedClientId ?? null;

    const title =
      input.titleOverride?.trim() ||
      `${salesQuote.title} (from CRM v${version.versionNumber})`;

    const productLines = crmLines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceAmount: line.unitAmount,
      estimatedUnitCostAmount: undefined,
    }));

    const productQuote = await createQuote(txContext, {
      title,
      clientId: clientId ?? undefined,
      opportunityId: salesQuote.opportunityId,
      currency: salesQuote.currency,
      taxMode: 'exclusive',
      notes: version.notes ?? undefined,
      lines: productLines,
      sourceCrmQuoteId: salesQuote.id,
    });

    await noteModuleUsage(tx, context.organizationId, 'crm');
    await recordAuditEvent(txContext, {
      action: CRM_AUDIT_ACTIONS.SALES_QUOTE_CONVERTED,
      entityType: 'crm_sales_quote',
      entityId: salesQuote.id,
      after: {
        convertedToProductQuoteId: productQuote.id,
        sourceVersionId: versionId,
        lineCount: crmLines.length,
        isNotBilling: true,
      },
    });

    return { productQuoteId: productQuote.id, created: true };
  });
}
