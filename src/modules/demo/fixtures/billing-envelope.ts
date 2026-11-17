import type { DemoFixtureBilling, DemoFixtureContract, DemoFixturePayment } from './fixture-builder';
// fixture-builder wires this module after contracts + raw billing are built.
import { grossFromNet, money, taxFromNet } from './monthly-activity';

export type { DemoFixtureBilling, DemoFixturePayment };

const MONEY_EPSILON = 1;

/** Per-project weight for distributing monthly invoices (active contracted projects). */
const MONTHLY_PROJECT_WEIGHTS: Readonly<Record<string, number>> = {
  'p-active': 10,
  'p-active-2': 5,
  'p-service': 2,
  'p-hold': 1,
};

export interface MonthlyBillingPlanRow {
  readonly key: string;
  readonly clientKey: string;
  readonly reference: string;
  readonly issueDate: string;
  readonly paymentDate: string;
  readonly paymentReference: string;
  readonly net: number;
}

export interface AllocateBillingInput {
  readonly projectCaps: ReadonlyMap<string, number>;
  readonly legacyBilling: readonly DemoFixtureBilling[];
  readonly monthlyPlan: readonly MonthlyBillingPlanRow[];
  readonly legacyPayments: readonly DemoFixturePayment[];
  readonly collectionRate?: number;
}

export interface AllocateBillingResult {
  readonly billing: DemoFixtureBilling[];
  readonly payments: DemoFixturePayment[];
}

function isMonthlyBillingKey(key: string): boolean {
  return key.startsWith('b-m-');
}

function sumNetByProject(rows: readonly { projectKey: string; net: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.projectKey, (map.get(row.projectKey) ?? 0) + row.net);
  }
  return map;
}

function scaleBillingRow(row: DemoFixtureBilling, net: number): DemoFixtureBilling {
  const rounded = Math.round(net * 100) / 100;
  return {
    ...row,
    subtotalAmount: money(rounded),
    totalAmount: grossFromNet(rounded),
  };
}

function applyLegacyCaps(
  legacy: DemoFixtureBilling[],
  caps: ReadonlyMap<string, number>,
): { billing: DemoFixtureBilling[]; scaleByProject: Map<string, number> } {
  const nets = legacy.map((row) => ({
    projectKey: row.projectKey,
    net: Number(row.subtotalAmount),
    row,
  }));
  const totals = sumNetByProject(nets);
  const scaleByProject = new Map<string, number>();

  for (const [projectKey, total] of totals) {
    const cap = caps.get(projectKey);
    if (cap === undefined || cap <= 0) {
      scaleByProject.set(projectKey, 1);
      continue;
    }
    if (total > cap + MONEY_EPSILON) {
      scaleByProject.set(projectKey, cap / total);
    } else {
      scaleByProject.set(projectKey, 1);
    }
  }

  const billing = legacy.map((row) => {
    const factor = scaleByProject.get(row.projectKey) ?? 1;
    if (factor >= 1 - 1e-9) return row;
    return scaleBillingRow(row, Number(row.subtotalAmount) * factor);
  });

  return { billing, scaleByProject };
}

function remainingCapacity(
  caps: ReadonlyMap<string, number>,
  legacyByProject: Map<string, number>,
): Map<string, number> {
  const remaining = new Map<string, number>();
  for (const [projectKey, cap] of caps) {
    const used = legacyByProject.get(projectKey) ?? 0;
    remaining.set(projectKey, Math.max(0, Math.round((cap - used) * 100) / 100));
  }
  return remaining;
}

function weightedMonthlyTargets(remaining: Map<string, number>): Array<{ projectKey: string; weight: number }> {
  const targets: Array<{ projectKey: string; weight: number }> = [];
  for (const [projectKey, weight] of Object.entries(MONTHLY_PROJECT_WEIGHTS)) {
    const cap = remaining.get(projectKey) ?? 0;
    if (cap > MONEY_EPSILON) {
      targets.push({ projectKey, weight });
    }
  }
  return targets;
}

function pickMonthlyProject(
  targets: Array<{ projectKey: string; weight: number }>,
  index: number,
): string {
  if (targets.length === 0) return 'p-active';
  const totalWeight = targets.reduce((sum, row) => sum + row.weight, 0);
  let pick = index % totalWeight;
  for (const target of targets) {
    pick -= target.weight;
    if (pick < 0) return target.projectKey;
  }
  return targets[targets.length - 1]!.projectKey;
}

function clientKeyForProject(projectKey: string, legacy: readonly DemoFixtureBilling[]): string {
  const hit = legacy.find((row) => row.projectKey === projectKey);
  if (hit) return hit.clientKey;
  if (projectKey === 'p-active-2' || projectKey === 'p-hold') return 'c2';
  if (projectKey === 'p-service') return 'c3';
  if (projectKey === 'p-done') return 'c4';
  return 'c1';
}

function adjustLegacyPayments(
  legacyBilling: readonly DemoFixtureBilling[],
  legacyPayments: readonly DemoFixturePayment[],
  scaleByProject: Map<string, number>,
): DemoFixturePayment[] {
  const billedNet = new Map(
    legacyBilling.map((row) => [row.key, Number(row.subtotalAmount)]),
  );
  const paidSoFar = new Map<string, number>();

  return legacyPayments.map((payment) => {
    const projectFactor = scaleByProject.get(payment.projectKey) ?? 1;
    let amount = Math.round(Number(payment.amount) * projectFactor * 100) / 100;
    const cap = billedNet.get(payment.billingKey) ?? 0;
    const running = (paidSoFar.get(payment.billingKey) ?? 0) + amount;
    if (running > cap + MONEY_EPSILON) {
      amount = Math.max(0, Math.round((cap - (paidSoFar.get(payment.billingKey) ?? 0)) * 100) / 100);
    }
    paidSoFar.set(payment.billingKey, (paidSoFar.get(payment.billingKey) ?? 0) + amount);
    return { ...payment, amount: money(amount) };
  });
}

/**
 * Fits legacy + monthly billing inside per-project CCV caps, spreads monthly invoices across
 * active contracted projects by weight, and keeps collections at ~70% per monthly invoice.
 */
export function allocateBillingWithinContract(input: AllocateBillingInput): AllocateBillingResult {
  const collectionRate = input.collectionRate ?? 0.7;
  const legacy = input.legacyBilling.filter((row) => !isMonthlyBillingKey(row.key));
  const { billing: cappedLegacy, scaleByProject } = applyLegacyCaps(legacy, input.projectCaps);

  const legacyByProject = sumNetByProject(
    cappedLegacy.map((row) => ({ projectKey: row.projectKey, net: Number(row.subtotalAmount) })),
  );
  const remaining = remainingCapacity(input.projectCaps, legacyByProject);
  const targets = weightedMonthlyTargets(remaining);

  const rawMonthlyTotal = input.monthlyPlan.reduce((sum, row) => sum + row.net, 0);
  const capacityTotal = targets.reduce((sum, target) => sum + (remaining.get(target.projectKey) ?? 0), 0);
  const monthlyGlobalScale =
    rawMonthlyTotal > MONEY_EPSILON ? Math.min(1, capacityTotal / rawMonthlyTotal) : 0;

  const monthlyBilling: DemoFixtureBilling[] = [];
  const monthlyPayments: DemoFixturePayment[] = [];

  input.monthlyPlan.forEach((plan, index) => {
    const scaledNet = Math.round(plan.net * monthlyGlobalScale * 100) / 100;
    if (scaledNet <= 0) return;

    let projectKey = pickMonthlyProject(targets, index);
    let allocated = scaledNet;
    const room = remaining.get(projectKey) ?? 0;
    if (allocated > room + MONEY_EPSILON) {
      allocated = room;
    }
    if (allocated <= 0) {
      const alternate = targets.find((row) => (remaining.get(row.projectKey) ?? 0) > MONEY_EPSILON);
      if (!alternate) return;
      projectKey = alternate.projectKey;
      allocated = Math.min(scaledNet, remaining.get(projectKey) ?? 0);
    }
    if (allocated <= 0) return;

    remaining.set(projectKey, Math.round(((remaining.get(projectKey) ?? 0) - allocated) * 100) / 100);

    const clientKey = clientKeyForProject(projectKey, cappedLegacy);
    monthlyBilling.push({
      key: plan.key,
      projectKey,
      clientKey,
      reference: plan.reference,
      subtotalAmount: money(allocated),
      totalAmount: grossFromNet(allocated),
      issueDate: plan.issueDate,
    });

    const payNet = Math.round(allocated * collectionRate * 100) / 100;
    monthlyPayments.push({
      billingKey: plan.key,
      projectKey,
      clientKey,
      amount: money(payNet),
      paymentDate: plan.paymentDate,
      reference: plan.paymentReference,
    });
  });

  const legacyPayments = adjustLegacyPayments(cappedLegacy, input.legacyPayments, scaleByProject);

  return {
    billing: [...cappedLegacy, ...monthlyBilling],
    payments: [...legacyPayments, ...monthlyPayments],
  };
}

export function projectCapsFromContracts(contracts: readonly DemoFixtureContract[]): Map<string, number> {
  const caps = new Map<string, number>();
  for (const contract of contracts) {
    caps.set(contract.projectKey, Number(contract.originalValueNet));
  }
  return caps;
}

export interface ServiceCostParts {
  readonly expenses: Array<{
    projectKey: string;
    netAmount: string;
    grossAmount: string;
    taxAmount: string;
  }>;
  readonly vendorBills: Array<{
    projectKey: string;
    netAmount: string;
    grossAmount: string;
    taxAmount: string;
    paidGross?: string;
  }>;
  readonly timeEntries: Array<{
    projectKey: string;
    hours: string;
    hourlyRate?: number;
  }>;
}

/**
 * Scale down p-service fixture costs in place (no reassignment to other projects).
 * Caps expenses + AP + estimated labor (hours×rate) at costRatio × CCV so engine Actual ≤ CCV.
 */
export function scaleServiceProjectCosts(
  projectKey: string,
  ccvNet: number,
  parts: ServiceCostParts,
  costRatio = 0.85,
): ServiceCostParts {
  const cap = Math.round(ccvNet * costRatio * 100) / 100;

  const expenseNet = parts.expenses
    .filter((row) => row.projectKey === projectKey)
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  const apNet = parts.vendorBills
    .filter((row) => row.projectKey === projectKey)
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  const laborNet = parts.timeEntries
    .filter((row) => row.projectKey === projectKey)
    .reduce((sum, row) => sum + Number(row.hours) * (row.hourlyRate ?? 0), 0);
  const total = expenseNet + apNet + laborNet;
  if (total <= cap + MONEY_EPSILON) {
    return parts;
  }

  // Leave ₪1 headroom so row-level rounding cannot push the sum over the cap.
  const factor = Math.max(0, (cap - MONEY_EPSILON) / total);

  const scaleMoney = (net: number): { net: string; gross: string; tax: string } => {
    const scaledNet = Math.round(net * factor * 100) / 100;
    return {
      net: money(scaledNet),
      gross: grossFromNet(scaledNet),
      tax: taxFromNet(scaledNet),
    };
  };

  const expenses = parts.expenses.map((row) => {
    if (row.projectKey !== projectKey) return row;
    const scaled = scaleMoney(Number(row.netAmount));
    return { ...row, netAmount: scaled.net, grossAmount: scaled.gross, taxAmount: scaled.tax };
  });

  const vendorBills = parts.vendorBills.map((row) => {
    if (row.projectKey !== projectKey) return row;
    const scaled = scaleMoney(Number(row.netAmount));
    const paidGross =
      row.paidGross !== undefined
        ? money(Math.round(Number(row.paidGross) * factor * 100) / 100)
        : undefined;
    return {
      ...row,
      netAmount: scaled.net,
      grossAmount: scaled.gross,
      taxAmount: scaled.tax,
      paidGross,
    };
  });

  const timeEntries = parts.timeEntries.map((row) => {
    if (row.projectKey !== projectKey) return row;
    const hours = Math.round(Number(row.hours) * factor * 100) / 100;
    return { ...row, hours: hours.toFixed(2) };
  });

  return { expenses, vendorBills, timeEntries };
}