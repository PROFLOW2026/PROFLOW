/**
 * After a customer payment or allocation has committed.
 * Provider failure must not roll the payment back. A receipt that already
 * exists for the payment is skipped by the statutory planner.
 */
export function scheduleStatutoryForAllocations(
  context: { readonly userId: string; readonly organizationId: string },
  paymentId: string,
  allocations: readonly { readonly billingRecordId: string; readonly amount: string }[],
): void {
  const usable = allocations.filter(
    (row) => row.billingRecordId.trim() && row.amount.trim(),
  );
  if (usable.length === 0) return;

  void import(
    '@/modules/invoicing-integration/application/trigger-statutory-after-payment'
  )
    .then(({ scheduleStatutoryAfterAllocatedPayments }) => {
      scheduleStatutoryAfterAllocatedPayments(
        context.userId,
        context.organizationId,
        paymentId,
        usable.map((row) => ({
          billingRecordId: row.billingRecordId,
          allocatedAmount: row.amount,
        })),
      );
    })
    .catch((error) => {
      console.error('[statutory-after-payment] schedule failed (payment preserved)', {
        organizationId: context.organizationId,
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
