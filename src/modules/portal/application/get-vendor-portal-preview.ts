import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  assertNoSensitiveVendorFields,
  buildVendorPortalSession,
  buildVendorSafePaymentOutstanding,
  buildVendorSafePoSummary,
  buildVendorSafeRfqSummary,
  grantHasVendorScope,
  isVendorPortalSession,
} from '../domain/safe-vendor-projection';
import { grantIsActive } from '../domain/safe-project-summary';
import { assertGrantBelongsToOrganization } from '../domain/tenant-isolation';
import { normalizeVendorScopes } from '../domain/vendor-scopes';
import type { VendorPortalPreview } from '../domain/types';
import {
  findGrantById,
  findVendorName,
  listVendorScopedRfqsForPortal,
  listVendorPurchaseOrdersForPortal,
} from '../data/portal.repository';
import { listApBillCandidatesForVendorGrant } from './submit-vendor-ap-candidate';
import { listComplianceCandidatesForVendorGrant } from './submit-vendor-compliance-candidate';
import {
  vendorPortalPreviewSchema,
  type VendorPortalPreviewInput,
} from '../validation/schemas';

/**
 * Admin / foundation preview of vendor-safe portal projections.
 * Public vendor login is DISABLED; this path uses PORTAL_MANAGE only.
 * ExternalPrincipal session is built from the grant — never Membership.
 */
export async function getVendorPortalPreview(
  context: OrgContext,
  rawInput: VendorPortalPreviewInput,
): Promise<VendorPortalPreview> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = vendorPortalPreviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const grant = await findGrantById(context.organizationId, parsed.data.grantId);
  if (!grant || grant.portalKind !== 'vendor' || !grant.vendorId) {
    throw new NotFoundError('Vendor portal grant');
  }
  assertGrantBelongsToOrganization(grant, context.organizationId);
  if (!grantIsActive(grant)) {
    throw new DomainRuleError('Portal grant is not active', 'errors.notAllowed');
  }

  const session = buildVendorPortalSession({
    grant,
    principalEmail: 'preview@external',
  });
  if (!isVendorPortalSession(session)) {
    throw new DomainRuleError(
      'ExternalPrincipal session must not be treated as membership',
      'errors.notAllowed',
    );
  }
  if (session.organizationId !== context.organizationId) {
    throw new DomainRuleError('Cross-tenant portal access denied', 'portal.errors.crossTenant');
  }

  const scopes = normalizeVendorScopes(grant.scopes);
  const vendorName = await findVendorName(context.db, context.organizationId, grant.vendorId);
  if (!vendorName) throw new NotFoundError('Vendor');

  const rfqs = grantHasVendorScope(grant, 'rfq.read')
    ? (
        await listVendorScopedRfqsForPortal(
          context.db,
          context.organizationId,
          grant.vendorId,
        )
      ).map((rfq) =>
        buildVendorSafeRfqSummary({
          rfqId: rfq.id,
          title: rfq.title,
          status: rfq.status,
          dueDate: rfq.dueDate,
          projectName: rfq.projectName,
          lines: rfq.lines,
        }),
      )
    : [];

  const purchaseOrders = grantHasVendorScope(grant, 'po.view')
    ? (
        await listVendorPurchaseOrdersForPortal(
          context.db,
          context.organizationId,
          grant.vendorId,
        )
      ).map((po) =>
        buildVendorSafePoSummary({
          purchaseOrderId: po.id,
          reference: po.reference,
          status: po.status,
          currency: po.currency,
          orderTotal: po.committedAmount,
          orderedOn: po.orderedOn,
          projectName: po.projectName,
          lines: po.lines,
        }),
      )
    : [];

  const apBillCandidates = grantHasVendorScope(grant, 'bill.candidate')
    ? await listApBillCandidatesForVendorGrant(context, grant.vendorId)
    : [];

  const complianceCandidates = grantHasVendorScope(grant, 'documents.upload')
    ? await listComplianceCandidatesForVendorGrant(context, grant.vendorId)
    : [];

  const paymentOutstanding = grantHasVendorScope(grant, 'payment.outstanding')
    ? buildVendorSafePaymentOutstanding()
    : undefined;

  const preview: VendorPortalPreview = {
    vendorId: grant.vendorId,
    vendorName,
    scopes,
    rfqs,
    purchaseOrders,
    apBillCandidates,
    complianceCandidates,
    paymentOutstanding,
    candidateIntakeNote: 'candidates_only',
    rfqVisibility: 'vendor_associated_only',
    publicLoginStatus: 'disabled',
    identityModel: 'external_principal',
  };

  assertNoSensitiveVendorFields(preview as unknown as Record<string, unknown>);
  return preview;
}
