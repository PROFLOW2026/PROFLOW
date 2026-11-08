import { describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  sqlUuidEqAny,
  taskProjectAccessCondition,
} from '@/modules/tasks/domain/task-project-access-filter';

const dialect = new PgDialect();

function rendered(query: SQL) {
  return dialect.sqlToQuery(query);
}

const ONE = '018f1234-5678-7abc-8def-0123456789ab';
const TWO = '018f1234-5678-7abc-8def-0123456789ac';

describe('sqlUuidEqAny', () => {
  it('is false when the id list is empty', () => {
    const query = rendered(sqlUuidEqAny(sql`project_id`, []));
    expect(query.sql.trim()).toBe('false');
    expect(query.params).toEqual([]);
  });

  it('binds one uuid inside a single array', () => {
    const query = rendered(sqlUuidEqAny(sql`project_id`, [ONE]));
    expect(query.sql).toBe('project_id = ANY(ARRAY[$1::uuid]::uuid[])');
    expect(query.params).toEqual([ONE]);
  });

  it('joins many uuids inside one array', () => {
    const query = rendered(sqlUuidEqAny(sql`project_id`, [ONE, TWO]));
    expect(query.sql).toBe('project_id = ANY(ARRAY[$1::uuid, $2::uuid]::uuid[])');
    expect(query.params).toEqual([ONE, TWO]);
    expect(query.sql).not.toContain('ANY($1, $2)');
  });
});

describe('taskProjectAccessCondition', () => {
  it('returns undefined for full org project scope', () => {
    expect(taskProjectAccessCondition(null)).toBeUndefined();
    expect(taskProjectAccessCondition(undefined)).toBeUndefined();
  });

  it('keeps an IS NULL predicate for an empty allowlist', () => {
    const query = rendered(taskProjectAccessCondition([])!);
    expect(query.sql).toContain('IS NULL');
    expect(query.sql.toLowerCase()).toContain('false');
    expect(query.params).toEqual([]);
  });

  it('returns SQL for a restricted project list', () => {
    const query = rendered(taskProjectAccessCondition([ONE])!);
    expect(query.sql).toContain('IS NULL');
    expect(query.sql).toContain('ANY(ARRAY[');
    expect(query.params).toEqual([ONE]);
  });
});
