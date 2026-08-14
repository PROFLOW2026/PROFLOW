import { describe, expect, it } from 'vitest';
import {
  expandBulkWorkDates,
  previewBulkTimeEntries,
  WEEKDAY_WORKDAYS,
} from '@/modules/workforce/domain/bulk-time-expand';
import { correctTimeEntrySchema, createBulkTimeEntriesSchema } from '@/modules/workforce/validation/schemas';

describe('expandBulkWorkDates', () => {
  it('expands Mon–Fri same hours across a calendar week', () => {
    const days = expandBulkWorkDates({
      fromDate: '2026-08-10', // Monday
      toDate: '2026-08-16', // Sunday
      hours: '8',
      weekdays: [...WEEKDAY_WORKDAYS],
    });

    expect(days.map((day) => day.workDate)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ]);
    expect(days.every((day) => day.hours === '8')).toBe(true);
  });

  it('applies per-day hour overrides while keeping unlisted weekdays at default hours', () => {
    const days = expandBulkWorkDates({
      fromDate: '2026-08-10',
      toDate: '2026-08-12',
      hours: '8',
      weekdays: [1, 2, 3],
      dayHours: [{ workDate: '2026-08-11', hours: '4' }],
    });

    expect(days).toEqual([
      { workDate: '2026-08-10', hours: '8' },
      { workDate: '2026-08-11', hours: '4' },
      { workDate: '2026-08-12', hours: '8' },
    ]);
  });

  it('rejects inverted ranges', () => {
    expect(() =>
      expandBulkWorkDates({
        fromDate: '2026-08-12',
        toDate: '2026-08-10',
        hours: '8',
      }),
    ).toThrow(/fromDate must be on or before toDate/);
  });

  it('preview totals hours across expanded days', () => {
    const preview = previewBulkTimeEntries({
      fromDate: '2026-08-10',
      toDate: '2026-08-11',
      hours: '7.5',
      weekdays: [1, 2],
    });
    expect(preview.entryCount).toBe(2);
    expect(preview.totalHours).toBe('15');
  });
});

describe('void-correction schemas', () => {
  it('requires correctsEntryId for corrections', () => {
    const parsed = correctTimeEntrySchema.safeParse({
      employeeId: '11111111-1111-4111-8111-111111111111',
      workDate: '2026-08-10',
      hours: '8',
      kind: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a full correction payload', () => {
    const parsed = correctTimeEntrySchema.safeParse({
      correctsEntryId: '33333333-3333-4333-8333-333333333333',
      employeeId: '11111111-1111-4111-8111-111111111111',
      workDate: '2026-08-10',
      hours: '6',
      kind: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
      description: 'Fixed hours',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires hours or dayHours for bulk create', () => {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: '11111111-1111-4111-8111-111111111111',
      fromDate: '2026-08-10',
      toDate: '2026-08-12',
      kind: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts bulk create with weekday filter', () => {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: '11111111-1111-4111-8111-111111111111',
      fromDate: '2026-08-10',
      toDate: '2026-08-14',
      hours: '8',
      weekdays: [1, 2, 3, 4, 5],
      kind: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires time code for non-project bulk', () => {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: '11111111-1111-4111-8111-111111111111',
      fromDate: '2026-08-10',
      toDate: '2026-08-10',
      hours: '4',
      kind: 'non_project',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('void-correction invariants (source)', () => {
  it('application voids original then inserts replacement with corrects_entry_id', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../../src/modules/workforce/application/time-entries.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).toContain('voidTimeEntryRow');
    expect(source).toContain('correctsEntryId: original.id');
    expect(source).toContain('TIME_ENTRY_VOIDED');
    expect(source).toContain('TIME_ENTRY_CORRECTED');
    expect(source).toContain("entityType: 'time_correction'");
    expect(source).not.toMatch(/\.update\(timeEntries\)[\s\S]*hours:/);
  });

  it('Actual rollups exclude void status', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../../src/modules/workforce/data/time-entries.repository.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).toContain("eq(timeEntries.status, 'recorded')");
    expect(source).toContain('voidTimeEntryRow');
    expect(source).toContain('bulkBatchId');
  });
});
