import { describe, expect, it } from 'vitest';
import {
  assembleExpenseListFilters,
  parseExpenseListSearchParams,
} from '@/modules/expenses/domain/expense-list-query';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

describe('expense list query', () => {
  it('keeps lifecycle status instead of dropping it before the query', () => {
    const query = parseExpenseListSearchParams({ status: 'finalized', dateFrom: '2026-01-01' });
    const filters = assembleExpenseListFilters(query);
    expect(filters.status).toBe('finalized');
    expect(filters.dateFrom).toBe('2026-01-01');
    expect(filters.dateBasis).toBe('expense');
    expect(filters.attentionFilter).toBeUndefined();
  });

  it('applies payment date separately from expense date and combines the other filters', () => {
    const query = parseExpenseListSearchParams({
      dateBasis: 'payment',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
      projectId: PROJECT_ID,
      costFamily: 'shared',
      costCategoryId: CATEGORY_ID,
      status: 'void',
      cash: 'paid',
      cashSource: 'suppliers',
    });
    const filters = assembleExpenseListFilters(query);
    expect(filters).toMatchObject({
      dateBasis: 'payment',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
      projectId: PROJECT_ID,
      costFamily: 'shared',
      costCategoryId: CATEGORY_ID,
      status: 'void',
      cash: 'paid',
      cashSource: 'suppliers',
    });
  });

  it('keeps valid filters when another field is empty or malformed', () => {
    const query = parseExpenseListSearchParams({
      dateFrom: '',
      dateTo: 'not-a-date',
      projectId: 'not-a-uuid',
      costCategoryId: CATEGORY_ID,
      status: 'finalized',
      cash: 'paid',
    });
    const filters = assembleExpenseListFilters(query);
    expect(filters.dateFrom).toBeUndefined();
    expect(filters.dateTo).toBeUndefined();
    expect(filters.projectId).toBeUndefined();
    expect(filters.costCategoryId).toBe(CATEGORY_ID);
    expect(filters.status).toBe('finalized');
    expect(filters.cash).toBe('paid');
  });

  it('maps the treatment strip to every actionable condition', () => {
    const query = parseExpenseListSearchParams({ attention: 'any', page: '2' });
    expect(query.statusFilter).toBe('any');
    expect(query.page).toBe(2);
    expect(assembleExpenseListFilters(query).attentionFilter).toBe('any');
  });

  it('parses org-scoped text search and passes it to list filters', () => {
    const query = parseExpenseListSearchParams({ q: '  cement  ', status: 'finalized' });
    expect(query.q).toBe('cement');
    expect(assembleExpenseListFilters(query).search).toBe('cement');
  });
});
