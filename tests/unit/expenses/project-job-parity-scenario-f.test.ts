import { describe, expect, it } from 'vitest';
import { allocateByProjectWeights, validateAllocationSum } from '@/modules/expenses/domain/allocation';
import {
  applyActiveDayExposureToBases,
  projectActiveDaysInSlice,
  selectEligibleProjects,
  selectEligibleProjectsForMethod,
  type ProjectEligibilityFacts,
} from '@/modules/expenses/domain/allocation-eligibility';
import { isEligibleForContractWeightAllocation } from '@/modules/financials/domain/work-pricing';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

const ILS = 'ILS';

/**
 * Scenario F - overhead across projects + jobs with short job period exposure.
 * Open-price jobs are excluded from contract_weight (no invented contract).
 * Snapshots remain slice-scoped; SUM(lines) = slice NET.
 */

function entity(
  id: string,
  opts: {
    readonly start: string | null;
    readonly end: string | null;
    readonly workKind?: 'project' | 'job';
    readonly pricingMode?: 'fixed' | 'open' | null;
  },
): ProjectEligibilityFacts {
  return {
    id,
    status: 'active',
    startDate: opts.start ? businessDate(opts.start) : null,
    actualEndDate: opts.end ? businessDate(opts.end) : null,
    targetEndDate: null,
    archivedAt: null,
    workKind: opts.workKind ?? 'project',
    pricingMode: opts.pricingMode ?? null,
  };
}

describe('Scenario F - overhead projects+jobs + short exposure', () => {
  const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };

  const portfolio: ProjectEligibilityFacts[] = [
    entity('proj-a', { start: '2026-01-01', end: null, workKind: 'project' }),
    entity('proj-b', { start: '2026-01-01', end: null, workKind: 'project' }),
    // Short job: active only Jan 28–31 (4 days)
    entity('job-short', {
      start: '2026-01-28',
      end: '2026-01-31',
      workKind: 'job',
      pricingMode: 'fixed',
    }),
    // Full-month fixed job
    entity('job-full', {
      start: '2026-01-01',
      end: null,
      workKind: 'job',
      pricingMode: 'fixed',
    }),
    // Open-price job - eligible for equal_split / labor / direct, NOT contract_weight
    entity('job-open', {
      start: '2026-01-01',
      end: null,
      workKind: 'job',
      pricingMode: 'open',
    }),
  ];

  it('includes projects and jobs in period eligibility', () => {
    const eligible = selectEligibleProjects(portfolio, jan).map((p) => p.id);
    expect(eligible).toEqual(['job-full', 'job-open', 'job-short', 'proj-a', 'proj-b']);
  });

  it('excludes open-price jobs from contract_weight only', () => {
    expect(isEligibleForContractWeightAllocation('job', 'open')).toBe(false);
    expect(isEligibleForContractWeightAllocation('job', 'fixed')).toBe(true);
    expect(isEligibleForContractWeightAllocation('project', null)).toBe(true);

    const contractEligible = selectEligibleProjectsForMethod(
      portfolio,
      jan,
      'contract_weight',
    ).map((p) => p.id);
    expect(contractEligible).toEqual(['job-full', 'job-short', 'proj-a', 'proj-b']);
    expect(contractEligible).not.toContain('job-open');

    const equalEligible = selectEligibleProjectsForMethod(
      portfolio,
      jan,
      'equal_split',
    ).map((p) => p.id);
    expect(equalEligible).toContain('job-open');
  });

  it('prorates short job by active-day exposure under contract_weight', () => {
    const short = portfolio.find((p) => p.id === 'job-short')!;
    expect(projectActiveDaysInSlice(short, jan)).toBe(4);

    const eligible = selectEligibleProjectsForMethod(portfolio, jan, 'contract_weight');
    const rawBases = [
      { projectId: 'proj-a', basisValue: '1000000', basisUnit: 'money' as const },
      { projectId: 'proj-b', basisValue: '1000000', basisUnit: 'money' as const },
      { projectId: 'job-short', basisValue: '1000000', basisUnit: 'money' as const },
      { projectId: 'job-full', basisValue: '1000000', basisUnit: 'money' as const },
    ];

    const exposed = applyActiveDayExposureToBases({
      method: 'contract_weight',
      slice: jan,
      projects: eligible,
      bases: rawBases,
    });

    const byId = new Map(exposed.map((b) => [b.projectId, b.basisValue]));
    expect(Number(byId.get('proj-a'))).toBeCloseTo(1000000, 5);
    expect(Number(byId.get('job-full'))).toBeCloseTo(1000000, 5);
    // 1_000_000 × 4/31
    expect(Number(byId.get('job-short'))).toBeCloseTo((1000000 * 4) / 31, 5);
    expect(byId.has('job-open')).toBe(false);

    const sliceNet = money('3100', ILS);
    const { lines } = allocateByProjectWeights({
      allocatableNet: sliceNet,
      method: 'contract_weight',
      periodStart: jan.start,
      periodEnd: jan.end,
      bases: exposed,
    });

    validateAllocationSum(
      sliceNet,
      lines.map((line) => line.amount),
    );

    const shortLine = lines.find((l) => l.projectId === 'job-short')!;
    const fullLine = lines.find((l) => l.projectId === 'job-full')!;
    expect(Number(shortLine.amount.amount)).toBeLessThan(Number(fullLine.amount.amount));
    // Exposed bases: 1 + 1 + 4/31 + 1 → short share = (4/31) / (3 + 4/31) of slice
    const expectedShort = (3100 * (4 / 31)) / (3 + 4 / 31);
    expect(Number(shortLine.amount.amount)).toBeCloseTo(expectedShort, 0);
  });

  it('equal_split still includes open-price with active-day basis', () => {
    const eligible = selectEligibleProjectsForMethod(portfolio, jan, 'equal_split');
    const bases = eligible.map((p) => ({
      projectId: p.id,
      basisValue: '1',
      basisUnit: 'count' as const,
    }));

    const exposed = applyActiveDayExposureToBases({
      method: 'equal_split',
      slice: jan,
      projects: eligible,
      bases,
    });

    expect(exposed.map((b) => b.projectId).sort()).toEqual([
      'job-full',
      'job-open',
      'job-short',
      'proj-a',
      'proj-b',
    ]);
    expect(exposed.find((b) => b.projectId === 'job-short')!.basisValue).toBe('4');
    expect(exposed.find((b) => b.projectId === 'job-open')!.basisValue).toBe('31');

    const sliceNet = money('1000', 'ILS');
    const { lines } = allocateByProjectWeights({
      allocatableNet: sliceNet,
      method: 'equal_split',
      periodStart: jan.start,
      periodEnd: jan.end,
      bases: exposed,
    });
    validateAllocationSum(
      sliceNet,
      lines.map((line) => line.amount),
    );
  });
});
