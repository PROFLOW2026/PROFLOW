import {
  FINANCIAL_REALISM_SETTING_KEY,
  FINANCIAL_REALISM_VERSION,
  HISTORY_END,
  SEED_MARKER,
  STAGE_NAMES,
} from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import { generateClients, type ProjectSpec } from './generate-specs.ts';
import { intBetween, mulberry32 } from './rng.ts';

const YEAR_2026_START = '2026-01-01';
const REAL_BILL_PREFIX = `${SEED_MARKER}/REAL/BILL`;

/** Stage-weighted billing curve — sums to 1.0 across full project lifecycle. */
const STAGE_BILLING_WEIGHTS = [
  0.04, 0.06, 0.08, 0.1, 0.09, 0.05, 0.07, 0.11, 0.14, 0.09, 0.1, 0.07,
] as const;

export type CollectionProfile = 'on_time' | 'late' | 'partial' | 'open';

export interface StageInvoicePlan {
  readonly stageIndex: number;
  readonly stageName: string;
  readonly issueDate: string;
  readonly amount: string;
  readonly ref: string;
  readonly lineDesc: string;
}

export interface FinancialRealismReport {
  projectsTimelineUpdated: number;
  milestonesRescheduled: number;
  legacyBillingsVoided: number;
  legacyPaymentsVoided: number;
  billingsCreated: number;
  paymentsCreated: number;
  billing2026Net: string;
  collected2026Net: string;
  openInvoices: number;
  partialInvoices: number;
  latePayments: number;
}

function roundAmount(value: number): string {
  const rounded = Math.round(value / 100) * 100;
  return String(Math.max(0, rounded)).replace(/\.00$/, '');
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function interpolateDate(startIso: string, endIso: string, fraction: number): string {
  const start = parseIsoDate(startIso).getTime();
  const end = parseIsoDate(endIso).getTime();
  const clamped = Math.max(0, Math.min(1, fraction));
  return formatIsoDate(new Date(start + (end - start) * clamped));
}

function isWithin2026Window(iso: string): boolean {
  return iso >= YEAR_2026_START && iso <= HISTORY_END;
}

/** Map each stage to a milestone date along the project timeline. */
export function stageIssueDate(spec: ProjectSpec, stageIndex: number): string {
  const fraction = stageIndex / Math.max(STAGE_NAMES.length - 1, 1);
  const raw = interpolateDate(spec.startDate, spec.targetEndDate, fraction);
  if (spec.bucket === 'completed' && stageIndex >= spec.stageIndex) {
    return interpolateDate(spec.startDate, spec.targetEndDate, Math.min(fraction, 0.92));
  }
  if (spec.bucket === 'waiting' && stageIndex > spec.stageIndex) {
    return addDays(raw, 45);
  }
  return raw;
}

/** Build 2026 billing from stage milestones that fall in the billing window. */
export function build2026StageBillingPlan(spec: ProjectSpec): StageInvoicePlan[] {
  const contractNet = Number(spec.contractNet);
  if (contractNet <= 0) return [];

  const weightTotal = STAGE_BILLING_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const plans: StageInvoicePlan[] = [];

  for (let stageIndex = 0; stageIndex <= spec.stageIndex; stageIndex += 1) {
    const issueDate = stageIssueDate(spec, stageIndex);
    if (!isWithin2026Window(issueDate)) continue;

    const weight = STAGE_BILLING_WEIGHTS[stageIndex] ?? 0;
    const amount = roundAmount((contractNet * weight) / weightTotal);
    if (Number(amount) <= 0) continue;

    plans.push({
      stageIndex,
      stageName: STAGE_NAMES[stageIndex] ?? `Stage ${stageIndex + 1}`,
      issueDate,
      amount,
      ref: `${REAL_BILL_PREFIX}/${spec.docNum}/S${String(stageIndex).padStart(2, '0')}`,
      lineDesc: `חיוב שלב — ${STAGE_NAMES[stageIndex]} (${spec.name.slice(0, 32)})`,
    });
  }

  if (plans.length === 0 && spec.bucket !== 'completed' && spec.stageIndex >= 2) {
    const progressPct = (spec.stageIndex + 1) / STAGE_NAMES.length;
    const annualShare = Math.min(0.18, progressPct * 0.22);
    const amount = roundAmount(contractNet * annualShare * 0.65);
    if (Number(amount) > 0) {
      const month = String(intBetween(mulberry32(Number(spec.docNum)), 1, 9)).padStart(2, '0');
      plans.push({
        stageIndex: spec.stageIndex,
        stageName: STAGE_NAMES[spec.stageIndex] ?? 'התקדמות',
        issueDate: `2026-${month}-15`,
        amount,
        ref: `${REAL_BILL_PREFIX}/${spec.docNum}/P01`,
        lineDesc: `חיוב התקדמות — ${spec.name.slice(0, 32)}`,
      });
    }
  }

  if (plans.length <= 1) return plans;

  const totalAmount = roundAmount(plans.reduce((sum, plan) => sum + Number(plan.amount), 0));
  const issueDate = plans.reduce((latest, plan) => (plan.issueDate > latest ? plan.issueDate : latest), plans[0]!.issueDate);
  const stageName = plans[plans.length - 1]?.stageName ?? 'התקדמות';
  return [
    {
      stageIndex: plans[plans.length - 1]!.stageIndex,
      stageName,
      issueDate,
      amount: totalAmount,
      ref: `${REAL_BILL_PREFIX}/${spec.docNum}/Y2026`,
      lineDesc: `חיוב התקדמות 2026 — ${spec.name.slice(0, 32)} (${stageName})`,
    },
  ];
}

export function collectionProfileForInvoice(docNum: string, invoiceRef: string): CollectionProfile {
  const rng = mulberry32(Number(docNum) * 997 + invoiceRef.length * 131);
  const roll = rng();
  if (roll < 0.38) return 'on_time';
  if (roll < 0.62) return 'late';
  if (roll < 0.82) return 'partial';
  return 'open';
}

export function paymentDateForProfile(
  profile: CollectionProfile,
  dueDate: string,
  issueDate: string,
  rng: () => number,
): { paymentDate: string | null; payFraction: number } {
  switch (profile) {
    case 'on_time':
      return { paymentDate: addDays(dueDate, intBetween(rng, -2, 5)), payFraction: 1 };
    case 'late':
      return { paymentDate: addDays(dueDate, intBetween(rng, 12, 42)), payFraction: 1 };
    case 'partial':
      return { paymentDate: addDays(dueDate, intBetween(rng, 5, 25)), payFraction: intBetween(rng, 50, 85) / 100 };
    case 'open':
      return { paymentDate: null, payFraction: 0 };
  }
}

export function estimate2026BillingRange(projectSpecs: readonly ProjectSpec[]): {
  min: string;
  max: string;
  expected: string;
} {
  let total = 0;
  for (const spec of projectSpecs) {
    for (const plan of build2026StageBillingPlan(spec)) {
      total += Number(plan.amount);
    }
  }
  const expected = roundAmount(total);
  const min = roundAmount(total * 0.85);
  const max = roundAmount(total * 1.15);
  return { min, max, expected };
}

/** Demo-only fast void — canonical per-record voiding 250+ legacy rows exceeds seed timeouts. */
async function voidLegacySeedBillings(
  organizationId: string,
): Promise<{ billingsVoided: number; paymentsVoided: number }> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const paymentsResult = await sql<{ id: string }[]>`
      with legacy as (
        select id from billing_records
        where organization_id = ${organizationId}::uuid
          and notes like ${'%' + SEED_MARKER + '%'}
          and reference not like ${REAL_BILL_PREFIX + '%'}
          and status in ('draft', 'finalized')
      )
      update payments p
      set status = 'void', voided_at = now(), updated_at = now()
      from legacy l
      where p.billing_record_id = l.id
        and p.organization_id = ${organizationId}::uuid
        and p.status = 'recorded'
      returning p.id`;
    const billingsResult = await sql<{ id: string }[]>`
      update billing_records
      set status = 'void', voided_at = now(), updated_at = now()
      where organization_id = ${organizationId}::uuid
        and notes like ${'%' + SEED_MARKER + '%'}
        and reference not like ${REAL_BILL_PREFIX + '%'}
        and status in ('draft', 'finalized')
      returning id`;
    return { billingsVoided: billingsResult.length, paymentsVoided: paymentsResult.length };
  } finally {
    await sql.end();
  }
}

export async function applyFinancialRealism(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<FinancialRealismReport> {
  const clients = generateClients();
  const clientPaymentTerms = new Map(clients.map((client) => [client.key, client.paymentTermKey]));

  let skipHeavyPhases = false;
  await runPhase('check financial realism state', target.organizationId, target.userId, async (context) => {
    const { getOrganizationSettingValue } = await import(
      '../../src/modules/tenancy/data/organization-settings.repository.ts'
    );
    const { billingRecords } = await import('@drizzle/schema');
    const { and, eq, like, gte, lte, sql } = await import('drizzle-orm');
    const version = await getOrganizationSettingValue<string>(
      context.db,
      target.organizationId,
      FINANCIAL_REALISM_SETTING_KEY,
    );
    if (version !== FINANCIAL_REALISM_VERSION) return;
    const [{ total, count }] = await context.db
      .select({
        total: sql<string>`coalesce(sum(${billingRecords.subtotalAmount})::text, '0')`,
        count: sql<number>`count(*)::int`,
      })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          like(billingRecords.reference, `${REAL_BILL_PREFIX}%`),
          eq(billingRecords.status, 'finalized'),
          gte(billingRecords.issueDate, YEAR_2026_START),
          lte(billingRecords.issueDate, HISTORY_END),
        ),
      );
    if (count > 0 && Number(total) > 0) {
      skipHeavyPhases = true;
      stats.notes.push(`Financial realism v${version} already applied (${total} ILS 2026 billing); skip rebuild.`);
    }
  });

  const report: FinancialRealismReport = {
    projectsTimelineUpdated: 0,
    milestonesRescheduled: 0,
    legacyBillingsVoided: 0,
    legacyPaymentsVoided: 0,
    billingsCreated: 0,
    paymentsCreated: 0,
    billing2026Net: '0',
    collected2026Net: '0',
    openInvoices: 0,
    partialInvoices: 0,
    latePayments: 0,
  };

  const billingRange = estimate2026BillingRange(projectSpecs);
  stats.notes.push(
    `2026 billing target (stage-derived): ${billingRange.expected} ILS (range ${billingRange.min}–${billingRange.max})`,
  );

  await runPhase('restore project seed markers', target.organizationId, target.userId, async (context) => {
    const { projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;
      await context.db
        .update(projects)
        .set({
          description: `${SEED_MARKER}:project:${spec.docNum}`,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.id, projectId)));
    }
  });

  if (skipHeavyPhases) {
    await runPhase('summarize financial realism totals', target.organizationId, target.userId, async (context) => {
      const { billingRecords, payments } = await import('@drizzle/schema');
      const { and, eq, like, gte, lte, sql } = await import('drizzle-orm');
      const [{ billing }] = await context.db
        .select({ billing: sql<string>`coalesce(sum(${billingRecords.subtotalAmount})::text, '0')` })
        .from(billingRecords)
        .where(
          and(
            eq(billingRecords.organizationId, target.organizationId),
            like(billingRecords.reference, `${REAL_BILL_PREFIX}%`),
            eq(billingRecords.status, 'finalized'),
            gte(billingRecords.issueDate, YEAR_2026_START),
            lte(billingRecords.issueDate, HISTORY_END),
          ),
        );
      const [{ collected }] = await context.db
        .select({ collected: sql<string>`coalesce(sum(${payments.amount})::text, '0')` })
        .from(payments)
        .where(
          and(
            eq(payments.organizationId, target.organizationId),
            like(payments.reference, `${SEED_MARKER}/REAL/PAY/%`),
            eq(payments.status, 'recorded'),
          ),
        );
      report.billing2026Net = billing;
      report.collected2026Net = collected;
    });
    return report;
  }

  await runPhase('update multi-year project timelines', target.organizationId, target.userId, async (context) => {
    const { projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const [row] = await context.db
        .select({ startDate: projects.startDate, targetEndDate: projects.targetEndDate })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.id, projectId)))
        .limit(1);

      if (row?.startDate === spec.startDate && row?.targetEndDate === spec.targetEndDate) continue;

      await context.db
        .update(projects)
        .set({
          startDate: spec.startDate,
          targetEndDate: spec.targetEndDate,
          description: `${SEED_MARKER}:project:${spec.docNum}`,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.id, projectId)));
      report.projectsTimelineUpdated += 1;
    }
  });

  await runPhase('reschedule seed milestones to timeline', target.organizationId, target.userId, async (context) => {
    const { updateMilestone } = await import('../../src/modules/projects/index.ts');
    const { projectMilestones } = await import('@drizzle/schema');
    const { and, eq, like, asc } = await import('drizzle-orm');

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const milestones = await context.db
        .select({ id: projectMilestones.id, name: projectMilestones.name })
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.organizationId, target.organizationId),
            eq(projectMilestones.projectId, projectId),
            like(projectMilestones.notes, `%${SEED_MARKER}%`),
          ),
        )
        .orderBy(asc(projectMilestones.createdAt));

      if (milestones.length === 0) continue;

      const rng = mulberry32(Number(spec.docNum) + 9001);
      const stageTargets = [
        Math.min(spec.stageIndex, 2),
        Math.min(spec.stageIndex + 1, STAGE_NAMES.length - 1),
      ];

      for (const [idx, milestone] of milestones.entries()) {
        const stageIndex = stageTargets[idx] ?? spec.stageIndex;
        let targetDate = stageIssueDate(spec, stageIndex);
        if (targetDate > HISTORY_END) {
          targetDate = addDays(HISTORY_END, -intBetween(rng, 7, 21));
        }
        await updateMilestone(context, {
          milestoneId: milestone.id,
          targetDate,
        });
        report.milestonesRescheduled += 1;
      }
    }
  });

  await runPhase('void legacy seed billings', target.organizationId, target.userId, async (context) => {
    const { billingRecords } = await import('@drizzle/schema');
    const { and, eq, like, not, inArray, sql } = await import('drizzle-orm');
    const [{ legacyCount }] = await context.db
      .select({ legacyCount: sql<number>`count(*)::int` })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          like(billingRecords.notes, `%${SEED_MARKER}%`),
          not(like(billingRecords.reference, `${REAL_BILL_PREFIX}%`)),
          inArray(billingRecords.status, ['draft', 'finalized']),
        ),
      );
    if (legacyCount === 0) {
      stats.notes.push('Legacy seed billings already voided; skip.');
      return;
    }
    const voided = await voidLegacySeedBillings(target.organizationId);
    report.legacyBillingsVoided = voided.billingsVoided;
    report.legacyPaymentsVoided = voided.paymentsVoided;
    stats.notes.push(
      `Voided legacy billings ${voided.billingsVoided}, payments ${voided.paymentsVoided}`,
    );
  });

  const billingByRef = new Map<string, string>();

  await runPhase('rebuild 2026 stage-based billings', target.organizationId, target.userId, async (context) => {
    const { createBillingRecord, finalizeBillingRecord } = await import('../../src/modules/billing/index.ts');
    const { replaceBillingLines } = await import('../../src/modules/billing/data/billing.repository.ts');
    const {
      getCatalogEntryByKey,
      parsePaymentTermMetadata,
      suggestDueDateFromPaymentTerm,
    } = await import('../../src/modules/business-catalog/index.ts');
    const { billingRecords } = await import('@drizzle/schema');
    const { and, eq, gte, like, lte, sql } = await import('drizzle-orm');
    const { toNumericString, money } = await import('../../src/shared/money/money.ts');

    async function ensureBilling(
      plan: StageInvoicePlan,
      projectId: string,
      clientKey: string,
    ): Promise<string | null> {
      const [existing] = await context.db
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(
          and(
            eq(billingRecords.organizationId, target.organizationId),
            eq(billingRecords.reference, plan.ref),
          ),
        )
        .limit(1);
      if (existing) {
        billingByRef.set(plan.ref, existing.id);
        return existing.id;
      }

      const termKey = clientPaymentTerms.get(clientKey) ?? 'net_30';
      const termEntry = await getCatalogEntryByKey(context.db, target.organizationId, 'payment_term', termKey);
      if (!termEntry) return null;
      const termMeta = parsePaymentTermMetadata(termEntry.metadata);
      if (!termMeta) return null;
      const dueDate = suggestDueDateFromPaymentTerm({
        baseDateIso: plan.issueDate,
        dueDate: null,
        term: termMeta,
      });

      const draft = await createBillingRecord(context, {
        projectId,
        amount: plan.amount,
        currency: 'ILS',
        issueDate: plan.issueDate,
        paymentTermId: termEntry.id,
        dueDate: dueDate ?? undefined,
        reference: plan.ref,
        notes: `${SEED_MARKER}:realism:${plan.stageName}`,
        vatMode: 'exclusive',
        finalize: false,
      });
      await replaceBillingLines(context.db, target.organizationId, draft.id, [
        {
          description: plan.lineDesc,
          lineTotal: toNumericString(money(plan.amount, 'ILS')),
          currency: 'ILS',
          changeOrderId: null,
          sortOrder: 0,
        },
      ]);
      const finalized = await finalizeBillingRecord(context, draft.id);
      billingByRef.set(plan.ref, finalized.id);
      report.billingsCreated += 1;
      return finalized.id;
    }

    let processed = 0;
    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      for (const plan of build2026StageBillingPlan(spec)) {
        await ensureBilling(plan, projectId, spec.clientKey);
        processed += 1;
        if (processed % 25 === 0) {
          console.info(`[consultancy-seed] realism billing progress ${processed}`);
        }
      }
    }

    const [{ total }] = await context.db
      .select({ total: sql<string>`coalesce(sum(${billingRecords.subtotalAmount})::text, '0')` })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          like(billingRecords.reference, `${REAL_BILL_PREFIX}%`),
          eq(billingRecords.status, 'finalized'),
          gte(billingRecords.issueDate, YEAR_2026_START),
          lte(billingRecords.issueDate, HISTORY_END),
        ),
      );
    report.billing2026Net = total;
  });

  await runPhase('rebuild collections with payment terms', target.organizationId, target.userId, async (context) => {
    const { recordPayment, getBillingRecord } = await import('../../src/modules/billing/index.ts');
    const { billingRecords, payments } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');

    const billings = await context.db
      .select({
        id: billingRecords.id,
        reference: billingRecords.reference,
        dueDate: billingRecords.dueDate,
        issueDate: billingRecords.issueDate,
        subtotalAmount: billingRecords.subtotalAmount,
      })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          like(billingRecords.reference, `${REAL_BILL_PREFIX}%`),
          eq(billingRecords.status, 'finalized'),
        ),
      );

    let collected = 0;

    for (const billing of billings) {
      const docMatch = /\/REAL\/BILL\/(\d+)\//.exec(billing.reference ?? '');
      const docNum = docMatch?.[1] ?? '0';
      const profile = collectionProfileForInvoice(docNum, billing.reference ?? '');
      const payRef = (billing.reference ?? '').replace('/REAL/BILL/', '/REAL/PAY/');

      const [existingPay] = await context.db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.organizationId, target.organizationId), eq(payments.reference, payRef)))
        .limit(1);
      if (existingPay) continue;

      if (profile === 'open') {
        report.openInvoices += 1;
        continue;
      }

      const rng = mulberry32(Number(docNum) + (billing.reference?.length ?? 0) * 17);
      const { paymentDate, payFraction } = paymentDateForProfile(
        profile,
        billing.dueDate ?? billing.issueDate,
        billing.issueDate,
        rng,
      );
      if (!paymentDate || payFraction <= 0) {
        report.openInvoices += 1;
        continue;
      }

      if (paymentDate > HISTORY_END && profile === 'late') {
        report.openInvoices += 1;
        continue;
      }

      const billingRecord = await getBillingRecord(context, billing.id);
      const outstanding = Number(billingRecord.outstandingAmount.amount);
      const applied = Math.min(outstanding, Math.round(Number(billing.subtotalAmount) * payFraction));
      if (applied <= 0) {
        report.openInvoices += 1;
        continue;
      }

      await recordPayment(context, {
        billingRecordId: billing.id,
        amount: String(applied).replace(/\.00$/, ''),
        paymentDate,
        method: 'העברה בנקאית',
        reference: payRef,
        notes: `${SEED_MARKER}:realism:${profile}`,
      });

      report.paymentsCreated += 1;
      collected += applied;
      if (profile === 'late') report.latePayments += 1;
      if (profile === 'partial' || applied < Number(billing.subtotalAmount) * 0.95) {
        report.partialInvoices += 1;
      }
    }

    report.collected2026Net = String(collected).replace(/\.00$/, '');
  });

  await runPhase('store financial realism version', target.organizationId, target.userId, async (context) => {
    const { upsertOrganizationSettingValue } = await import(
      '../../src/modules/tenancy/data/organization-settings.repository.ts'
    );
    await upsertOrganizationSettingValue(
      context.db,
      target.organizationId,
      FINANCIAL_REALISM_SETTING_KEY,
      FINANCIAL_REALISM_VERSION,
    );
  });

  stats.notes.push(
    `Financial realism: 2026 billing ${report.billing2026Net} ILS, collected ${report.collected2026Net} ILS, open ${report.openInvoices}, partial ${report.partialInvoices}`,
  );

  return report;
}
