import type { BusinessDate } from '@/shared/dates';
import type { CostFamily, ExpenseStatus } from './types';
import type { ExpenseAttentionFilter } from './expense-attention';
import {
  isExpenseListAttentionStatusFilter,
  resolveExpenseListStatusFilterFromQuery,
  type ExpenseListStatusFilter,
} from './expense-status-filter';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COST_FAMILIES = ['direct_project', 'shared', 'business_overhead', 'asset_capital'] as const;

export interface ParsedExpenseListQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly dateBasis: 'expense' | 'payment';
  readonly projectId?: string;
  readonly costFamily?: CostFamily;
  readonly costCategoryId?: string;
  readonly status?: 'draft' | 'finalized' | 'void';
  readonly attention?: ExpenseAttentionFilter;
  readonly unallocated: boolean;
  readonly cash?: 'open' | 'paid';
  readonly cashSource?: 'suppliers' | 'subcontractors';
  readonly q?: string;
  readonly page: number;
  readonly statusFilter: ExpenseListStatusFilter;
}

const EXPENSE_LIST_Q_MAX_LEN = 120;

function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function dateOrUndefined(value: unknown): string | undefined {
  const text = firstString(value);
  return text && DATE_PATTERN.test(text) ? text : undefined;
}

function uuidOrUndefined(value: unknown): string | undefined {
  const text = firstString(value);
  return text && UUID_PATTERN.test(text) ? text : undefined;
}

/**
 * Keep every valid filter when another query field is empty or malformed.
 * A single invalid value must not drop the rest of the list query.
 */
export function parseExpenseListSearchParams(
  raw: Record<string, unknown>,
): ParsedExpenseListQuery {
  const costFamilyRaw = firstString(raw.costFamily);
  const costFamily = COST_FAMILIES.find((family) => family === costFamilyRaw);
  const statusRaw = firstString(raw.status);
  const status =
    statusRaw === 'draft' || statusRaw === 'finalized' || statusRaw === 'void'
      ? statusRaw
      : undefined;
  const attentionRaw = firstString(raw.attention);
  const attention =
    attentionRaw === 'project_allocation' ||
    attentionRaw === 'classification' ||
    attentionRaw === 'approval' ||
    attentionRaw === 'any'
      ? attentionRaw
      : undefined;
  const unallocatedRaw = firstString(raw.unallocated);
  const unallocated = unallocatedRaw === 'true' || unallocatedRaw === '1';
  const cashRaw = firstString(raw.cash);
  const cash = cashRaw === 'open' || cashRaw === 'paid' ? cashRaw : undefined;
  const cashSourceRaw = firstString(raw.cashSource);
  const cashSource =
    cashSourceRaw === 'suppliers' || cashSourceRaw === 'subcontractors' ? cashSourceRaw : undefined;
  const dateBasis = firstString(raw.dateBasis) === 'payment' ? 'payment' : 'expense';
  const pageRaw = Number(firstString(raw.page));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const qRaw = firstString(raw.q);
  const q = qRaw ? qRaw.slice(0, EXPENSE_LIST_Q_MAX_LEN) : undefined;

  const parsed = {
    dateFrom: dateOrUndefined(raw.dateFrom),
    dateTo: dateOrUndefined(raw.dateTo),
    dateBasis,
    projectId: uuidOrUndefined(raw.projectId),
    costFamily,
    costCategoryId: uuidOrUndefined(raw.costCategoryId),
    status,
    attention,
    unallocated,
    cash,
    cashSource,
    q,
    page,
  } as const;

  return {
    ...parsed,
    statusFilter: resolveExpenseListStatusFilterFromQuery({
      status: parsed.status,
      attention: parsed.attention,
      unallocated: parsed.unallocated,
    }),
  };
}

export interface AssembledExpenseListFilters {
  readonly dateFrom?: BusinessDate;
  readonly dateTo?: BusinessDate;
  readonly dateBasis: 'expense' | 'payment';
  readonly projectId?: string;
  readonly costFamily?: CostFamily;
  readonly costCategoryId?: string;
  readonly status?: Extract<ExpenseStatus, 'finalized' | 'void'>;
  readonly unallocatedOnly: boolean;
  readonly attentionFilter?: ExpenseAttentionFilter;
  readonly cash?: 'open' | 'paid';
  readonly cashSource?: 'suppliers' | 'subcontractors';
  readonly search?: string;
}

export function assembleExpenseListFilters(
  query: ParsedExpenseListQuery,
): AssembledExpenseListFilters {
  const lifecycleStatus =
    query.statusFilter === 'finalized' || query.statusFilter === 'void'
      ? query.statusFilter
      : undefined;
  const attentionFilter = isExpenseListAttentionStatusFilter(query.statusFilter)
    ? query.statusFilter
    : undefined;

  return {
    dateFrom: query.dateFrom as BusinessDate | undefined,
    dateTo: query.dateTo as BusinessDate | undefined,
    dateBasis: query.dateBasis,
    projectId: query.projectId,
    costFamily: query.costFamily,
    costCategoryId: query.costCategoryId,
    status: lifecycleStatus,
    unallocatedOnly: query.statusFilter === 'project_allocation',
    attentionFilter,
    cash: query.cash,
    cashSource: query.cashSource,
    search: query.q,
  };
}
