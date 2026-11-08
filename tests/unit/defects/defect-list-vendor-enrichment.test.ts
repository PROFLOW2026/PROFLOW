import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '@/shared/db/types';
import { listDefectRows } from '@/modules/defects/data/defects.repository';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function projectId(index: number): string {
  return `22222222-2222-4222-8222-22222222222${index}`;
}

function vendorId(index: number): string {
  return `33333333-3333-4333-8333-33333333333${index}`;
}

function defectRow(index: number) {
  return {
    id: `44444444-4444-4444-8444-44444444444${index}`,
    projectId: projectId(index),
    referenceNo: index,
    title: `Defect ${index}`,
    severity: 'low',
    status: 'open',
    mode: 'construction',
    dueDate: null,
    cycleNo: 1,
    locationId: null,
    locationName: null,
    vendorId: vendorId(index),
    subcontractAgreementId: null,
    lastSubmittedAt: null,
    closedAt: null,
    createdAt: new Date('2026-11-08T00:00:00.000Z'),
    assigneeUserId: null,
  };
}

function listDb(rows: unknown[], enrichment: unknown[]) {
  const execute = vi.fn(async () => enrichment);
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  const select = vi.fn().mockReturnValue({ from });
  return {
    db: { select, execute } as unknown as DbExecutor,
    execute,
  };
}

describe('defect list vendor enrichment', () => {
  it('issues one enrichment query for N projects', async () => {
    const count = 4;
    const rows = Array.from({ length: count }, (_, index) => defectRow(index + 1));
    const enrichment = rows.map((row) => ({
      project_id: row.projectId,
      vendor_id: row.vendorId,
      vendor_name: `Vendor ${row.vendorId}`,
    }));
    const { db, execute } = listDb(rows, enrichment);

    const page = await listDefectRows(db, { organizationId: ORG_ID }, {}, 'internal', '2026-11-08');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(page.items).toHaveLength(count);
    const calls = execute.mock.calls as unknown[][];
    const sqlText = JSON.stringify(calls[0]?.[0] ?? '');
    expect(sqlText).toContain('project_id IN');
    expect(sqlText).not.toContain('external_principal_display_name');
    for (const row of rows) {
      expect(sqlText).toContain(row.projectId);
      const item = page.items.find((entry) => entry.id === row.id);
      expect(item?.vendor).toEqual({ id: row.vendorId, name: `Vendor ${row.vendorId}` });
    }
  });

  it('does not query vendors for an empty list', async () => {
    const { db, execute } = listDb([], []);
    const page = await listDefectRows(db, { organizationId: ORG_ID }, {}, 'internal', '2026-11-08');
    expect(page.items).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});
