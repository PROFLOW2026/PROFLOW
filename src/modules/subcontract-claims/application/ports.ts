import { getPaymentEligibilityInputs } from '@/modules/contractor-compliance';
import { runBestEffortInTransaction } from '@/shared/db/best-effort-savepoint';
import type { DbExecutor } from '@/shared/db/types';
import type { ComplianceEligibilityFacts } from '../domain/eligibility';

/**
 * Port to Track P (contractor compliance). Compliance decides whether payment is held; it never changes
 * what was certified. Returns null when the facts cannot be evaluated for this caller (no access / not
 * deployed), which the UI shows as "compliance not evaluated" rather than as compliant.
 */
export interface PaymentCompliancePort {
  load(db: DbExecutor, organizationId: string, agreementId: string): Promise<ComplianceEligibilityFacts | null>;
}

export const complianceEligibilityPort: PaymentCompliancePort = {
  async load(db, organizationId, agreementId) {
    let facts: ComplianceEligibilityFacts | null = null;
    // Savepoint: a compliance failure must not poison the caller's (RLS) transaction.
    await runBestEffortInTransaction(db, async () => {
      const inputs = await getPaymentEligibilityInputs(db, organizationId, agreementId);
      facts = {
        compliant: inputs.compliant,
        blocking: inputs.requirements
          .filter((requirement) => requirement.blocking)
          .map((requirement) => ({
            kind: requirement.kind,
            title: requirement.title,
            status: requirement.status,
            expiresOn: requirement.expiresOn,
          })),
      };
    });
    return facts;
  },
};

let activeCompliancePort: PaymentCompliancePort = complianceEligibilityPort;

export function compliancePort(): PaymentCompliancePort {
  return activeCompliancePort;
}

/** Test seam: swap the compliance port (returns a restore function). */
export function setCompliancePortForTesting(port: PaymentCompliancePort): () => void {
  const previous = activeCompliancePort;
  activeCompliancePort = port;
  return () => {
    activeCompliancePort = previous;
  };
}
