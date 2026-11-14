/**
 * Isolated diagnostic: prove monthReview-shaped payloads contain Flight-incompatible Date values.
 * Run: node docs/audits/evidence/exlfy-full-regression-2026-11/bug-02/flight-incompatible-props.mjs
 * Does not touch Production or product code.
 */

function collectIncompatible(value, path, out) {
  if (value == null) return;
  if (value instanceof Date) {
    out.push({ path, type: 'Date', iso: value.toISOString() });
    return;
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    out.push({ path, type: typeof value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectIncompatible(item, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === 'object') {
    if (value instanceof Map || value instanceof Set) {
      out.push({ path, type: value.constructor.name });
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      collectIncompatible(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/** Mirrors Drizzle timestamp mode:'date' rows returned by loadMonthlyEmployerCostReview. */
const monthReviewLike = {
  available: true,
  employeeId: 'emp-demo',
  yearMonth: '2026-10',
  month: {
    id: 'emc-1',
    organizationId: 'org-1',
    employeeId: 'emp-demo',
    yearMonth: '2026-10',
    estimatedAmount: '33000.000000',
    actualAmount: null,
    currency: 'ILS',
    status: 'draft',
    lockedAt: null,
    createdAt: new Date('2026-10-05T10:00:00.000Z'),
    updatedAt: new Date('2026-10-23T12:00:00.000Z'),
  },
  run: {
    id: 'run-1',
    createdAt: new Date('2026-10-23T12:00:00.000Z'),
    updatedAt: new Date('2026-10-23T12:00:00.000Z'),
    appliedAt: new Date('2026-10-23T12:05:00.000Z'),
  },
  lines: [],
  preview: { knownAmount: '25142.860000', knownQuality: 'estimated', status: 'draft' },
  months: [
    {
      id: 'emc-0',
      yearMonth: '2026-09',
      createdAt: new Date('2026-09-30T08:00:00.000Z'),
      updatedAt: new Date('2026-09-30T08:00:00.000Z'),
      lockedAt: null,
    },
  ],
  pendingSubmittedHours: '0',
};

const issues = [];
collectIncompatible(monthReviewLike, 'initialReview', issues);

const jsonRoundTrip = JSON.parse(JSON.stringify(monthReviewLike));
const issuesAfterJson = [];
collectIncompatible(jsonRoundTrip, 'afterJSON', issuesAfterJson);

const result = {
  title: 'BUG-02 Flight-incompatible props probe',
  nextRscClientRule:
    'Next.js App Router forbids Date (and other non-plain) values as props from Server Components to Client Components. JSON.stringify coerces Dates to strings; the RSC Flight boundary does not.',
  incompatiblePaths: issues,
  incompatibleCount: issues.length,
  afterJsonIncompatibleCount: issuesAfterJson.length,
  verdict:
    issues.length > 0 && issuesAfterJson.length === 0
      ? 'PROVEN_SHAPE: Drizzle-like Date fields are Flight-incompatible until explicitly serialized (same pattern as serializeTaskCardsForClient).'
      : 'UNEXPECTED',
  productMountEvidence:
    'employees/[employeeId]/page.tsx passes initialReview={monthReview} into client MonthlyEmployerCostReview when showMonthReview && payrollPayment.',
};

console.log(JSON.stringify(result, null, 2));
