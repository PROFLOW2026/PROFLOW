/**
 * READ-ONLY acceptance: financial year book 2026 vs engine truth + XLSX artifact.
 * No DB writes. Output under docs/audits/2026-10-financial-year-book-acceptance/
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from 'postgres';

config({ path: '.env.local' });

const YEAR = Number(process.env.ACCEPTANCE_YEAR ?? '2026');
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? '18eran@gmail.com').toLowerCase();
const OUT_DIR = resolve(
  process.cwd(),
  'docs/audits/2026-10-financial-year-book-acceptance',
);

function moneyNum(m: { amount: string } | null | undefined): number | null {
  if (!m) return null;
  const n = Number(m.amount);
  return Number.isFinite(n) ? n : null;
}

function eq(a: number | null, b: number | null, tolerance = 0.01): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

async function resolveOwnerOrg(
  sql: Sql,
): Promise<{ userId: string; organizationId: string; orgName: string }> {
  const orgFromEnv = process.env.ACCEPTANCE_ORG_ID?.trim();
  const [profile] = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE lower(email) = ${OWNER_EMAIL} LIMIT 1`;
  if (!profile) throw new Error(`Profile not found for ${OWNER_EMAIL}`);

  if (orgFromEnv) {
    const [row] = await sql<{ org_name: string }[]>`
      SELECT o.name AS org_name
      FROM organization_memberships om
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = ${profile.id} AND om.organization_id = ${orgFromEnv}::uuid`;
    if (!row) throw new Error('ACCEPTANCE_ORG_ID not linked to owner');
    return { userId: profile.id, organizationId: orgFromEnv, orgName: row.org_name };
  }

  const [membership] = await sql<{ organization_id: string; org_name: string }[]>`
    SELECT om.organization_id, o.name AS org_name
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = ${profile.id}
    ORDER BY o.created_at DESC
    LIMIT 1`;
  if (!membership) throw new Error('No org membership for owner');
  return {
    userId: profile.id,
    organizationId: membership.organization_id,
    orgName: membership.org_name,
  };
}

async function main() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  const owner = await resolveOwnerOrg(sql);
  await sql.end();

  const { withUserContext } = await import('../src/shared/db/client');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index');
  const { loadFinancialYearBookData } = await import(
    '../src/modules/financials/application/load-financial-year-book-data'
  );
  const { buildFinancialYearBookWorkbook } = await import(
    '../src/modules/exports/application/financial-year-book/build-workbook'
  );
  const { workbookSheetViews } = await import('../src/modules/exports/domain/xlsx');
  const { getMonthCashFlow } = await import('../src/modules/financials/application/get-month-cash-flow');
  const { getHomeDashboard } = await import('../src/modules/financials/application/get-home-dashboard');
  const { sumOrganizationRecognizedCostPairInDateRange } = await import(
    '../src/modules/financials/data/expenses.repository'
  );
  const { sumCollectionTripletsInDateRange, sumInvoicedInDateRange } = await import(
    '../src/modules/financials/data/billing.repository'
  );
  const { businessDate, endOfMonth } = await import('../src/shared/dates');
  const { zeroMoney } = await import('../src/shared/money');

  const memBefore = process.memoryUsage();

  const result = await withUserContext(owner.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: owner.userId,
      organizationId: owner.organizationId,
      locale: 'he-IL',
    });
    const currency = context.organization.baseCurrency.toUpperCase();

    const loadStarted = performance.now();
    const book = await loadFinancialYearBookData(context, YEAR);
    const loadMs = performance.now() - loadStarted;

    const buildStarted = performance.now();
    const xlsxBuffer = await buildFinancialYearBookWorkbook(book);
    const buildMs = performance.now() - buildStarted;

    const sheetViews = await workbookSheetViews(xlsxBuffer);
    const uuidInFile =
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
        xlsxBuffer.toString('latin1'),
      );

    const monthlyRows = [];
    for (const month of book.months) {
      const ym = month.period.yearMonth;
      const rangeTo =
        month.period.phase === 'partial' ? month.period.to : endOfMonth(businessDate(`${ym}-01`));

      const [recognized, invoiced, collections, dashboard] = await Promise.all([
        sumOrganizationRecognizedCostPairInDateRange(
          context.db,
          context.organizationId,
          currency,
          month.period.from,
          rangeTo,
        ),
        sumInvoicedInDateRange(
          context.db,
          context.organizationId,
          currency,
          month.period.from,
          rangeTo,
        ),
        sumCollectionTripletsInDateRange(
          context.db,
          context.organizationId,
          currency,
          month.period.from,
          rangeTo,
        ),
        getHomeDashboard(context, { selectedMonth: ym, workKindFilter: 'all' }),
      ]);
      const cashFlowDirect = await getMonthCashFlow(context, {
        from: month.period.from,
        to: rangeTo,
        collectionsActual: collections?.gross ?? zeroMoney(currency),
        collectionsDisplay: collections ?? undefined,
      });

      const s = month.summary;
      const bookRecognizedNet = moneyNum(s.recognizedCostNet);
      const engineRecognizedNet = moneyNum(recognized.net);
      const bookPaid = moneyNum(s.cashPaidGross);
      const enginePaid = moneyNum(cashFlowDirect.paidActual);
      const bookCollected = moneyNum(s.grossCollected);
      const engineCollected = moneyNum(collections?.gross);
      const bookInvoiced = moneyNum(s.netInvoiced);
      const engineInvoiced = moneyNum(invoiced);
      const bookEmc = moneyNum(s.employerCostNet);
      const engineEmc = month.employerCosts.reduce(
        (sum, line) => sum + Number(line.net.amount),
        0,
      );
      const overheadBook = month.overhead.reduce((sum, slice) => sum + Number(slice.net.amount), 0);
      const bookExpected = moneyNum(s.expectedCommitmentsGross);
      const engineExpected = moneyNum(cashFlowDirect.expectedOutgoing);
      const bookNetCash = moneyNum(s.netCashActual);
      const engineNetCash = moneyNum(cashFlowDirect.netCash);

      const dashCosts = moneyNum(dashboard.organizationSummary?.costsThisMonth ?? null);
      const dashInvoiced = moneyNum(dashboard.organizationSummary?.invoicedThisMonth ?? null);
      const dashCollected = moneyNum(dashboard.organizationSummary?.collectionsThisMonth ?? null);

      const paidLinesSum = month.payments
        .concat(month.payrollCash)
        .reduce((sum, line) => sum + Number(line.gross.amount), 0);
      const paidLinesMatchEngine = eq(paidLinesSum, enginePaid, 0.02);

      const operational = moneyNum(s.operationalProfitNet);
      const derivedOperational =
        bookInvoiced != null && bookRecognizedNet != null
          ? bookInvoiced - bookRecognizedNet
          : null;

      monthlyRows.push({
        month: ym,
        phase: month.period.phase,
        recognizedNet: {
          book: bookRecognizedNet,
          engine: engineRecognizedNet,
          dashboard: dashCosts,
          match: eq(bookRecognizedNet, engineRecognizedNet) && eq(bookRecognizedNet, dashCosts),
        },
        recognizedVat: {
          book: moneyNum(s.recognizedCostVat),
          engine: moneyNum(recognized.gross) != null && moneyNum(recognized.net) != null
            ? Number(recognized.gross.amount) - Number(recognized.net.amount)
            : null,
          match: eq(
            moneyNum(s.recognizedCostVat),
            moneyNum(recognized.gross) != null && moneyNum(recognized.net) != null
              ? Number(recognized.gross.amount) - Number(recognized.net.amount)
              : null,
          ),
        },
        cashPaidGross: {
          book: bookPaid,
          engine: enginePaid,
          match: eq(bookPaid, enginePaid),
          paidLinesSum,
          paidLinesMatchEngine,
        },
        collectionsGross: {
          book: bookCollected,
          engine: engineCollected,
          dashboard: dashCollected,
          match: eq(bookCollected, engineCollected) && eq(bookCollected, dashCollected),
        },
        netInvoiced: {
          book: bookInvoiced,
          engine: engineInvoiced,
          dashboard: dashInvoiced,
          match: eq(bookInvoiced, engineInvoiced) && eq(bookInvoiced, dashInvoiced),
        },
        employerCostNet: {
          book: bookEmc,
          engineLines: engineEmc || null,
          match: eq(bookEmc, engineEmc || null),
        },
        overheadNetSum: overheadBook,
        expectedCommitmentsGross: {
          book: bookExpected,
          engine: engineExpected,
          match: eq(bookExpected, engineExpected),
        },
        netCash: { book: bookNetCash, engine: engineNetCash, match: eq(bookNetCash, engineNetCash) },
        operationalProfitNet: {
          book: operational,
          derivedFromBookKpis: derivedOperational,
          match: eq(operational, derivedOperational),
          note: 'Not official CCV/contract profit — billing net minus recognized cost only',
        },
        billingVoidCount: month.billings.filter((b) => b.status === 'void').length,
        commitmentCount: month.commitments.length,
        receiptCount: month.receipts.length,
      });
    }

    const memAfter = process.memoryUsage();

    return {
      org: owner,
      currency,
      year: YEAR,
      timing: { loadMs, buildMs, totalMs: loadMs + buildMs },
      memory: {
        heapUsedMb: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024),
        rssMb: Math.round(memAfter.rss / 1024 / 1024),
      },
      xlsx: {
        bytes: xlsxBuffer.length,
        sheets: sheetViews.length,
        sheetNames: sheetViews.map((s) => s.name),
        allRtl: sheetViews.every((s) => s.rightToLeft),
        uuidDetected: uuidInFile,
      },
      monthlyRows,
      allMonthsMatch: monthlyRows.every(
        (r) =>
          r.recognizedNet.match &&
          r.cashPaidGross.match &&
          r.collectionsGross.match &&
          r.netInvoiced.match &&
          r.expectedCommitmentsGross.match &&
          r.netCash.match,
      ),
      xlsxBuffer,
      bookMeta: {
        organizationName: book.organizationName,
        generatedAt: book.generatedAt,
      },
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const xlsxPath = resolve(OUT_DIR, `ספר_כספי_${YEAR}.xlsx`);
  const xlsxFreshPath = resolve(OUT_DIR, `ספר_כספי_${YEAR}_acceptance_run.xlsx`);
  try {
    writeFileSync(xlsxPath, result.xlsxBuffer);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EBUSY' && code !== 'EPERM') throw error;
    writeFileSync(xlsxFreshPath, result.xlsxBuffer);
  }
  const { xlsxBuffer: _drop, ...report } = result;
  writeFileSync(resolve(OUT_DIR, 'acceptance-report.json'), JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ ...report, xlsxPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
