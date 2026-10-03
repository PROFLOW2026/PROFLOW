import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates';
import { evaluatePaymentEligibility, type PaymentEligibilityInputs } from '../domain/eligibility';
import { evaluateRequirements } from '../domain/views';
import {
  findAgreementScope,
  findOrganizationTimezone,
  listDocumentsForRequirements,
  listRequirements,
} from '../data/compliance.repository';

export interface PaymentEligibilityOptions {
  /** Evaluation date (yyyy-mm-dd). Default: today in the organization timezone. */
  readonly asOf?: string;
}

/**
 * Query port for Track F (claims / payment holds): compliance facts that decide whether this
 * agreement's payments must be held. `db` is the CALLER's executor (RLS-bound internal user with
 * contractor.view on the project, or service role for workers). Throws NotFound when the agreement
 * is not visible to the executor. Never returns money.
 */
export async function getPaymentEligibilityInputs(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  options: PaymentEligibilityOptions = {},
): Promise<PaymentEligibilityInputs> {
  const agreement = await findAgreementScope(db, organizationId, agreementId);
  if (!agreement) throw new NotFoundError('Subcontract agreement');

  const asOf =
    options.asOf ?? (todayInTimeZone((await findOrganizationTimezone(db, organizationId)) ?? 'Asia/Jerusalem') as string);
  const requirements = await listRequirements(db, organizationId, { agreementId });
  const documents = await listDocumentsForRequirements(
    db,
    organizationId,
    requirements.map((requirement) => requirement.id),
  );
  const evaluated = evaluateRequirements(requirements, documents, asOf);

  return evaluatePaymentEligibility(
    {
      organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      agreementId,
      asOf,
    },
    evaluated.map((row) => ({
      requirementId: row.id,
      kind: row.kind,
      title: row.title,
      isRequired: row.isRequired,
      blocksPayment: row.blocksPayment,
      status: row.evaluation.status,
      expiresOn: row.evaluation.expiresOn,
      pendingReview: row.evaluation.pendingReview,
    })),
  );
}
