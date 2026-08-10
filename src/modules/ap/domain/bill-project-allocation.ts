/**
 * Pure vendor-bill → project allocation amount resolution / conservation preview.
 *
 * Bill NET (`recognizedNet`) is the economic cost. Allocations only slice WHERE
 * it belongs. Payment amounts never enter this path.
 */

import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';

export const BILL_ALLOCATION_METHODS = [
  'manual_amount',
  'manual_percent',
  'active_days',
  'equal_split',
] as const;

export type BillAllocationMethod = (typeof BILL_ALLOCATION_METHODS)[number];

export interface BillAllocationLineDraft {
  readonly projectId: string;
  readonly method: BillAllocationMethod;
  readonly amount?: string | null;
  readonly percent?: string | null;
  readonly days?: string | null;
  readonly notes?: string | null;
}

export interface ResolvedBillAllocationLine {
  readonly projectId: string;
  readonly method: BillAllocationMethod;
  readonly amount: string;
  readonly percent: string | null;
  readonly basisDays: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface BillAllocationPreview {
  readonly allocated: string;
  readonly unallocated: string;
  readonly exceeds: boolean;
  readonly lineAmounts: readonly string[];
}

function toNumber(value: string | null | undefined): number {
  if (value == null || value.trim() === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Resolve a single line amount against bill NET (and optional total days). */
export function resolveBillAllocationLineAmount(
  line: BillAllocationLineDraft,
  recognizedNet: number,
  totalDays: number,
  lineCount: number,
): number {
  if (line.method === 'manual_amount') return toNumber(line.amount);
  if (line.method === 'manual_percent') {
    const pct = toNumber(line.percent);
    return (recognizedNet * pct) / 100;
  }
  if (line.method === 'equal_split') {
    if (lineCount <= 0) return 0;
    return recognizedNet / lineCount;
  }
  const days = toNumber(line.days);
  if (totalDays <= 0) return 0;
  return (recognizedNet * days) / totalDays;
}

/** Live conservation preview: allocated + unallocated = NET when not exceeding. */
export function previewBillAllocationStrip(input: {
  readonly recognizedNet: string;
  readonly lines: readonly BillAllocationLineDraft[];
}): BillAllocationPreview {
  const net = toNumber(input.recognizedNet);
  const totalDays = input.lines.reduce((sum, line) => sum + toNumber(line.days), 0);
  const lineAmounts = input.lines.map((line) =>
    resolveBillAllocationLineAmount(line, net, totalDays, input.lines.length),
  );
  const allocated = lineAmounts.reduce((sum, value) => sum + value, 0);
  const exceeds = allocated > net + 1e-9;
  const unallocated = Math.max(0, net - allocated);
  return {
    allocated: allocated.toFixed(2),
    unallocated: unallocated.toFixed(2),
    exceeds,
    lineAmounts: lineAmounts.map((value) => value.toFixed(6)),
  };
}

/**
 * Resolve and validate lines for persistence. Rejects over-NET.
 * Under-NET is allowed (visible unallocated remainder).
 */
export function resolveBillProjectAllocationLines(input: {
  readonly recognizedNet: string;
  readonly currency: string;
  readonly lines: readonly BillAllocationLineDraft[];
}): {
  readonly lines: readonly ResolvedBillAllocationLine[];
  readonly allocatedAmount: string;
  readonly unallocatedAmount: string;
} {
  const net = new Decimal(input.recognizedNet || '0');
  if (!net.isFinite() || net.isNegative()) {
    throw new DomainRuleError('Invalid bill NET', 'ap.errors.invalidBillNet');
  }

  if (input.lines.length === 0) {
    return {
      lines: [],
      allocatedAmount: '0',
      unallocatedAmount: net.toFixed(6),
    };
  }

  const projectIds = new Set<string>();
  for (const line of input.lines) {
    if (!line.projectId?.trim()) {
      throw new DomainRuleError('Project is required', 'ap.errors.allocationProjectRequired');
    }
    if (projectIds.has(line.projectId)) {
      throw new DomainRuleError(
        'Duplicate project in allocation lines',
        'ap.errors.allocationDuplicateProject',
      );
    }
    projectIds.add(line.projectId);
  }

  const totalDays = input.lines.reduce((sum, line) => sum + toNumber(line.days), 0);
  const resolvedAmounts = input.lines.map((line) =>
    new Decimal(
      resolveBillAllocationLineAmount(
        line,
        net.toNumber(),
        totalDays,
        input.lines.length,
      ).toFixed(6),
    ),
  );

  let allocated = new Decimal(0);
  for (const amount of resolvedAmounts) {
    if (amount.lessThanOrEqualTo(0)) {
      throw new DomainRuleError(
        'Allocation amount must be positive',
        'ap.errors.allocationAmountPositive',
      );
    }
    allocated = allocated.plus(amount);
  }

  if (allocated.greaterThan(net)) {
    throw new DomainRuleError(
      'Allocation exceeds bill NET',
      'ap.errors.allocationExceedsNet',
    );
  }

  const unallocated = net.minus(allocated);
  const lines: ResolvedBillAllocationLine[] = input.lines.map((line, index) => {
    const amount = resolvedAmounts[index]!;
    const percent =
      line.method === 'manual_percent'
        ? new Decimal(toNumber(line.percent)).toFixed(4)
        : net.isZero()
          ? null
          : amount.times(100).dividedBy(net).toFixed(4);
    return {
      projectId: line.projectId,
      method: line.method,
      amount: amount.toFixed(6),
      percent,
      basisDays: line.method === 'active_days' ? new Decimal(toNumber(line.days)).toFixed(4) : null,
      notes: line.notes ?? null,
      sortOrder: index,
    };
  });

  return {
    lines,
    allocatedAmount: allocated.toFixed(6),
    unallocatedAmount: unallocated.toFixed(6),
  };
}
