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
 */

import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { createQuote } from '@/modules/quotes/application/manage-quotes';
import { findOpportunityById } from '../data/crm.repository';
import {
  findSalesQuoteById,
  findSalesQuoteVersionById,
  listSalesQuoteLines,
  listSalesQuoteVersions,
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
  /** The newly created product quote id (estimates table). */
  readonly productQuoteId: string;
}

/**
 * Converts a CRM sales quote into a draft product quote.
 *
 * Flow:
 * 1. Load the CRM quote + its accepted version (or latest draft if not yet accepted).
 * 2. Load line items from that version.
 * 3. Resolve the client from the parent opportunity.
 * 4. Create a draft product quote via the standard createQuote action.
 * 5. Record audit trail.
 *
 * Requires: CRM_MANAGE + QUOTES_MANAGE permissions.
 */
export async function convertCrmQuoteToProductQuote(
  context: OrgContext,
  input: ConvertCrmQuoteInput,
): Promise<ConvertCrmQuoteResult> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);

  // ── 1. Load CRM quote ─────────────────────────────────────────────────────
  const salesQuote = await findSalesQuoteById(
    context.db,
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

  // ── 2. Resolve the version to use ─────────────────────────────────────────
  // Prefer accepted version; fall back to the most recent (highest version number).
  let versionId: string;
  if (salesQuote.acceptedVersionId) {
    versionId = salesQuote.acceptedVersionId;
  } else {
    const versions = await listSalesQuoteVersions(
      context.db,
      context.organizationId,
      salesQuote.id,
    );
    if (versions.length === 0) {
      throw new DomainRuleError(
        'CRM sales quote has no versions to convert',
        'crm.errors.quoteNoVersions',
      );
    }
    // listSalesQuoteVersions returns ordered by version_number DESC
    const latestVersion = versions[0]!;
    versionId = latestVersion.id;
  }

  const version = await findSalesQuoteVersionById(
    context.db,
    context.organizationId,
    versionId,
  );
  if (!version) throw new NotFoundError('CRM sales quote version');

  // ── 3. Load lines ──────────────────────────────────────────────────────────
  const crmLines = await listSalesQuoteLines(
    context.db,
    context.organizationId,
    versionId,
  );

  if (crmLines.length === 0) {
    throw new DomainRuleError(
      'CRM sales quote version has no line items to convert',
      'crm.errors.quoteNoLines',
    );
  }

  // ── 4. Resolve client from opportunity ────────────────────────────────────
  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    salesQuote.opportunityId,
  );
  const clientId = opportunity?.convertedClientId ?? null;

  // ── 5. Build title ────────────────────────────────────────────────────────
  const title =
    input.titleOverride?.trim() ||
    `${salesQuote.title} (from CRM v${version.versionNumber})`;

  // ── 6. Map CRM lines → product quote lines ────────────────────────────────
  // CRM line: description, quantity, unitAmount (= unit price), lineTotal
  // Product line: description, quantity, unitPriceAmount, estimatedUnitCostAmount?
  // We do NOT carry lineTotal — the product quote will recompute it.
  const productLines = crmLines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPriceAmount: line.unitAmount,
    // No estimated cost from CRM lines; the product quote owner will fill it.
    estimatedUnitCostAmount: undefined,
  }));

  // ── 7. Create the draft product quote ─────────────────────────────────────
  // createQuote handles permission check, totals recomputation, and audit events.
  const productQuote = await createQuote(context, {
    title,
    clientId: clientId ?? undefined,
    opportunityId: salesQuote.opportunityId,
    currency: salesQuote.currency,
    // Tax mode unknown from CRM side — default to exclusive for editable draft.
    taxMode: 'exclusive',
    notes: version.notes ?? undefined,
    lines: productLines,
    // Back-reference so the product quote knows its CRM origin.
    sourceCrmQuoteId: salesQuote.id,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.SALES_QUOTE_CREATED,
    entityType: 'crm_sales_quote',
    entityId: salesQuote.id,
    after: {
      convertedToProductQuoteId: productQuote.id,
      sourceVersionId: versionId,
      lineCount: crmLines.length,
      isNotBilling: true,
    },
  });

  return { productQuoteId: productQuote.id };
}
