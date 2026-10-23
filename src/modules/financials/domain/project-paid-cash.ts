/**
 * Cash actually paid and attributed to projects.
 * Recognized cost and unpaid obligations never enter this figure.
 */

import {
  isMaterialEconomicCategoryKey,
  isSubcontractorEconomicCategoryKey,
} from './economic-classification';
import { recordedNetPortion } from './business-cash-position';
import {
  addMoney,
  compareMoney,
  divideMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  multiplyMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export type ProjectPaidKind =
  | 'expense_header'
  | 'expense_line'
  | 'ap_header'
  | 'ap_line'
  | 'payroll_line'
  | 'advance';

export type ProjectPaidBucket = 'suppliers' | 'contractors' | 'other' | 'labor';

export interface ProjectPaidFact {
  readonly kind: ProjectPaidKind;
  readonly parentId: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly categoryKey: string | null;
  readonly subcontractAgreementId: string | null;
  readonly parentNet: string;
  readonly parentGross: string;
  readonly paidGross: string;
  readonly lineAmount: string | null;
  readonly amountBasis: 'net' | 'gross' | null;
  readonly knownAmount: string | null;
  readonly hasAllocation: boolean;
}

export interface ProjectPaidPart {
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
}

export interface ProjectPaidProjectLine extends ProjectPaidPart {
  readonly projectId: string;
  readonly projectName: string;
}

export interface ProjectPaidCash {
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly suppliers: ProjectPaidPart;
  readonly contractors: ProjectPaidPart;
  readonly other: ProjectPaidPart;
  readonly labor: ProjectPaidPart;
  readonly projects: readonly ProjectPaidProjectLine[];
}

interface AttributedSlice {
  readonly bucket: ProjectPaidBucket;
  readonly projectId: string;
  readonly projectName: string;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
}

export function composeProjectPaidCash(
  facts: readonly ProjectPaidFact[],
  currency: string,
): ProjectPaidCash | null {
  const slices: AttributedSlice[] = [];
  for (const group of groupFacts(facts).values()) {
    slices.push(...attributeGroup(group, currency));
  }
  const kept = slices.filter((slice) => isPositiveMoney(slice.net) || isPositiveMoney(slice.gross));
  if (kept.length === 0) return null;

  const suppliers = sumBucket(kept, 'suppliers', currency);
  const contractors = sumBucket(kept, 'contractors', currency);
  const other = sumBucket(kept, 'other', currency);
  const labor = sumBucket(kept, 'labor', currency);
  const net = roundMoney(addMoney(addMoney(suppliers.net, contractors.net), addMoney(other.net, labor.net)));
  const gross = roundMoney(
    addMoney(addMoney(suppliers.gross, contractors.gross), addMoney(other.gross, labor.gross)),
  );
  if (!isPositiveMoney(net) && !isPositiveMoney(gross)) return null;

  return {
    net,
    gross,
    suppliers,
    contractors,
    other,
    labor,
    projects: projectLines(kept, currency),
  };
}

function groupFacts(facts: readonly ProjectPaidFact[]): Map<string, ProjectPaidFact[]> {
  const groups = new Map<string, ProjectPaidFact[]>();
  for (const fact of facts) {
    const key = `${familyOf(fact.kind)}:${fact.parentId}`;
    const list = groups.get(key) ?? [];
    list.push(fact);
    groups.set(key, list);
  }
  return groups;
}

function familyOf(kind: ProjectPaidKind): string {
  if (kind === 'expense_header' || kind === 'expense_line') return 'expense';
  if (kind === 'ap_header' || kind === 'ap_line') return 'ap';
  if (kind === 'payroll_line') return 'payroll';
  return 'advance';
}

function attributeGroup(group: readonly ProjectPaidFact[], currency: string): AttributedSlice[] {
  const sample = group[0];
  if (!sample) return [];
  if (sample.kind === 'payroll_line') return attributePayroll(group, currency);
  if (sample.kind === 'advance') return attributeWhole(sample, currency);

  const header = group.find((fact) => fact.kind === 'expense_header' || fact.kind === 'ap_header');
  const lines = group.filter(
    (fact) => (fact.kind === 'expense_line' || fact.kind === 'ap_line') && fact.projectId && fact.lineAmount,
  );
  const basis = header ?? lines[0];
  if (!basis) return [];
  const paidGross = fromNumericString(basis.paidGross, currency);
  const parentGross = fromNumericString(basis.parentGross, currency) ?? paidGross;
  const parentNet = fromNumericString(basis.parentNet, currency) ?? parentGross;
  if (!paidGross || !parentGross || !parentNet || !isPositiveMoney(paidGross)) return [];
  const paidNet = recordedNetPortion(parentNet, parentGross, paidGross);
  const bucket = bucketFor(basis);

  if (lines.length > 0 || basis.hasAllocation) {
    const weighted = capShares(
      lines.map((line) => ({
        fact: line,
        share: lineShare(line, parentNet, parentGross, currency),
      })),
    );
    return weighted.flatMap((item) => {
      if (!item.fact.projectId || item.share <= 0) return [];
      return [
        slice(
          bucket,
          item.fact.projectId,
          item.fact.projectName,
          multiplyMoney(paidNet, item.share),
          multiplyMoney(paidGross, item.share),
        ),
      ];
    });
  }

  if (!header?.projectId) return [];
  return [slice(bucket, header.projectId, header.projectName, paidNet, paidGross)];
}

function attributePayroll(group: readonly ProjectPaidFact[], currency: string): AttributedSlice[] {
  const sample = group[0];
  if (!sample) return [];
  const paid = fromNumericString(sample.paidGross, currency);
  const known = fromNumericString(sample.knownAmount ?? '', currency);
  if (!paid || !known || !isPositiveMoney(paid) || !isPositiveMoney(known)) return [];
  const weighted = capShares(
    group.map((line) => ({
      fact: line,
      share: lineShareAmount(line.lineAmount, known, currency),
    })),
  );
  return weighted.flatMap((item) => {
    if (!item.fact.projectId || item.share <= 0) return [];
    const amount = multiplyMoney(paid, item.share);
    return [slice('labor', item.fact.projectId, item.fact.projectName, amount, amount)];
  });
}

function attributeWhole(fact: ProjectPaidFact, currency: string): AttributedSlice[] {
  if (!fact.projectId) return [];
  const paid = fromNumericString(fact.paidGross, currency);
  if (!paid || !isPositiveMoney(paid)) return [];
  return [slice(bucketFor(fact), fact.projectId, fact.projectName, paid, paid)];
}

function bucketFor(fact: ProjectPaidFact): ProjectPaidBucket {
  if (fact.kind === 'payroll_line') return 'labor';
  if (
    fact.kind === 'advance' ||
    fact.subcontractAgreementId ||
    isSubcontractorEconomicCategoryKey(fact.categoryKey)
  ) {
    return 'contractors';
  }
  if (fact.kind === 'ap_header' || fact.kind === 'ap_line') return 'suppliers';
  if (isMaterialEconomicCategoryKey(fact.categoryKey)) return 'suppliers';
  return 'other';
}

function lineShare(
  line: ProjectPaidFact,
  parentNet: MoneyValue,
  parentGross: MoneyValue,
  currency: string,
): number {
  const base = line.amountBasis === 'net' ? parentNet : parentGross;
  return lineShareAmount(line.lineAmount, base, currency);
}

function lineShareAmount(
  lineAmount: string | null,
  base: MoneyValue,
  currency: string,
): number {
  const line = fromNumericString(lineAmount ?? '', currency);
  if (!line || isZeroMoney(base) || !isPositiveMoney(line)) return 0;
  if (line.currency !== base.currency) return 0;
  return Number(divideMoney(line, base.amount).amount);
}

function capShares<T extends { readonly share: number }>(items: readonly T[]): T[] {
  const sum = items.reduce((total, item) => total + item.share, 0);
  if (sum <= 1 || sum === 0) return [...items];
  return items.map((item) => ({ ...item, share: item.share / sum }));
}

function slice(
  bucket: ProjectPaidBucket,
  projectId: string,
  projectName: string | null,
  net: MoneyValue,
  gross: MoneyValue,
): AttributedSlice {
  return {
    bucket,
    projectId,
    projectName: projectName?.trim() || projectId,
    net: roundMoney(net),
    gross: roundMoney(gross),
  };
}

function sumBucket(
  slices: readonly AttributedSlice[],
  bucket: ProjectPaidBucket,
  currency: string,
): ProjectPaidPart {
  return {
    net: roundMoney(sumMoney(slices.filter((slice) => slice.bucket === bucket).map((slice) => slice.net), currency)),
    gross: roundMoney(
      sumMoney(slices.filter((slice) => slice.bucket === bucket).map((slice) => slice.gross), currency),
    ),
  };
}

function sumMoney(values: readonly MoneyValue[], currency: string): MoneyValue {
  return values.reduce((total, value) => addMoney(total, value), zeroMoney(currency));
}

function projectLines(slices: readonly AttributedSlice[], currency: string): ProjectPaidProjectLine[] {
  const byProject = new Map<string, ProjectPaidProjectLine>();
  for (const slice of slices) {
    const current = byProject.get(slice.projectId) ?? {
      projectId: slice.projectId,
      projectName: slice.projectName,
      net: zeroMoney(currency),
      gross: zeroMoney(currency),
    };
    byProject.set(slice.projectId, {
      ...current,
      net: addMoney(current.net, slice.net),
      gross: addMoney(current.gross, slice.gross),
    });
  }
  return [...byProject.values()]
    .map((line) => ({ ...line, net: roundMoney(line.net), gross: roundMoney(line.gross) }))
    .filter((line) => isPositiveMoney(line.net) || isPositiveMoney(line.gross))
    .sort((left, right) => compareMoney(right.net, left.net));
}
