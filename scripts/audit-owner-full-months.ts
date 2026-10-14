/**
 * READ-ONLY: monthly dashboard reconciliation Jan-Oct 2026 for owner org.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const OWNER = '18eran@gmail.com';
const MONTHS = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
] as const;

async function main() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  const [owner] = await sql<{ user_id: string; org_name: string }[]>`
    SELECT p.id AS user_id, o.name AS org_name
    FROM profiles p
    JOIN organization_memberships om ON om.user_id = p.id AND om.organization_id = ${ORG}::uuid
    JOIN organizations o ON o.id = om.organization_id
    WHERE lower(p.email) = ${OWNER.toLowerCase()}`;
  if (!owner) throw new Error('Owner org link failed');
  await sql.end();

  const { withUserContext } = await import('../src/shared/db/client');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index');
  const { getHomeDashboard } = await import('../src/modules/financials/application/get-home-dashboard');
  const { getMonthCashFlow } = await import('../src/modules/financials/application/get-month-cash-flow');
  const { sumOrganizationRecognizedCostPairInDateRange } = await import(
    '../src/modules/financials/data/expenses.repository'
  );
  const { zeroMoney } = await import('../src/shared/money');
  const { endOfMonth, businessDate } = await import('../src/shared/dates');

  const monthChecks = await withUserContext(owner.user_id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: owner.user_id,
      organizationId: ORG,
      locale: 'he-IL',
    });
    const currency = context.organization.baseCurrency.toUpperCase();
    const out = [];
    for (const ym of MONTHS) {
      const from = businessDate(`${ym}-01`);
      const to = endOfMonth(from);
      const [dashboard, recognized, monthCash] = await Promise.all([
        getHomeDashboard(context, { selectedMonth: ym, workKindFilter: 'all' }),
        sumOrganizationRecognizedCostPairInDateRange(
          context.db,
          context.organizationId,
          currency,
          from,
          to,
        ),
        getMonthCashFlow(context, { from, to, collectionsActual: zeroMoney(currency) }),
      ]);
      out.push({
        month: ym,
        costsThisMonth: dashboard.organizationSummary?.costsThisMonth.amount ?? null,
        recognizedNet: recognized.net.amount,
        costsMatch: dashboard.organizationSummary?.costsThisMonth.amount === recognized.net.amount,
        paidActual: monthCash.paidActual.amount,
        paidLinesSum: monthCash.paidLines
          .reduce((s, l) => s + Number(l.amount.amount), 0)
          .toFixed(2),
        paidMatch:
          Number(monthCash.paidActual.amount).toFixed(2) ===
          monthCash.paidLines.reduce((s, l) => s + Number(l.amount.amount), 0).toFixed(2),
      });
    }
    return { orgName: owner.org_name, currency, monthChecks: out };
  });

  console.log(JSON.stringify(monthChecks, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
