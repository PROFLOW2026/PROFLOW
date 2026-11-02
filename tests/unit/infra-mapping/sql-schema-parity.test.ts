/**
 * STATIC consistency check between the prepared (NOT applied) migration 0195 and the Drizzle schema.
 * It only reads two text files - no SQL is executed anywhere.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sql = readFileSync(join(root, 'drizzle/migrations/0195_infra_mapping.sql'), 'utf8');
const schema = readFileSync(join(root, 'drizzle/schema/infra-mapping.ts'), 'utf8');
/** Columns added later by additive migrations (0196: optional level of a multi-level unit). */
const ADDED_LATER: Record<string, string[]> = { infra_captures: ['level_id'] };

const TABLES: Array<{ sql: string; ts: string }> = [
  { sql: 'infra_folder_mappings', ts: 'infraFolderMappings' },
  { sql: 'infra_captures', ts: 'infraCaptures' },
  { sql: 'infra_capture_versions', ts: 'infraCaptureVersions' },
  { sql: 'infra_markings', ts: 'infraMarkings' },
  { sql: 'infra_comparisons', ts: 'infraComparisons' },
];

function sqlColumns(table: string): string[] {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table} (`);
  if (start < 0) throw new Error(`missing CREATE TABLE for ${table}`);
  const end = sql.indexOf('\n);', start);
  const body = sql.slice(start, end).split('\n').slice(1);
  const columns: string[] = [];
  for (const line of body) {
    const match = /^\s{2}"?([a-z_0-9]+)"?\s+[a-z]/i.exec(line);
    if (!match) continue;
    const name = match[1]!;
    if (['constraint', 'primary', 'unique', 'check', 'foreign'].includes(name.toLowerCase())) continue;
    columns.push(name);
  }
  return columns.sort();
}

function tsColumns(exportName: string): string[] {
  const start = schema.indexOf(`export const ${exportName} = pgTable(`);
  if (start < 0) throw new Error(`missing pgTable ${exportName}`);
  const next = schema.indexOf('export const ', start + 10);
  const body = schema.slice(start, next < 0 ? undefined : next);
  const columns = new Set<string>();
  if (/\bid:\s*primaryId\(\)/.test(body)) columns.add('id');
  for (const match of body.matchAll(/(?:uuid|text|integer|boolean|timestamp|ts|jsonb|bigint|numeric|varchar|real|doublePrecision|smallint)\(\s*'([a-z_0-9]+)'/g)) {
    columns.add(match[1]!);
  }
  return [...columns].sort();
}

describe('migration 0195 matches the drizzle schema (static)', () => {
  for (const table of TABLES) {
    it(`${table.sql}: same columns`, () => {
      expect(tsColumns(table.ts)).toEqual([...sqlColumns(table.sql), ...(ADDED_LATER[table.sql] ?? [])].sort());
    });
  }

  it('every table has forced RLS and a service policy', () => {
    for (const table of TABLES) {
      expect(sql).toContain(`ALTER TABLE public.${table.sql} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table.sql} FORCE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY ${table.sql}_service_all ON public.${table.sql}`);
      expect(sql).toContain(`CREATE POLICY ${table.sql}_select ON public.${table.sql}`);
    }
  });

  it('is additive only: no DROP TABLE / DROP COLUMN / TRUNCATE / DELETE / UPDATE of existing data', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(code).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/^\s*DELETE\s+FROM\b/im);
    expect(code).not.toMatch(/^\s*UPDATE\s+public\./im);
    expect(code).not.toMatch(/\bALTER\s+TABLE\s+public\.(?!infra_)\w+/i);
  });

  it('every composite FK target already has its unique index in an EARLIER migration', () => {
    const dir = join(root, 'drizzle/migrations');
    const earlier = readdirSync(dir)
      .filter((name) => name.endsWith('.sql') && name < '0195')
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n');
    const targets: Array<[string, string]> = [
      ['project_locations', 'id, organization_id, project_id'],
      ['projects', 'id, organization_id'],
      ['evidence_items', 'id, organization_id'],
      ['tasks', 'id, organization_id'],
      ['vendors', 'id, organization_id'],
      ['organization_storage_connections', 'id, organization_id'],
    ];
    for (const [table, columns] of targets) {
      const pattern = new RegExp(`ON\\s+(public\\.)?"?${table}"?\\s*\\(\\s*"?${columns.replaceAll(', ', '"?\\s*,\\s*"?')}"?\\s*\\)`, 'i');
      expect(pattern.test(earlier), `${table}(${columns}) unique index`).toBe(true);
    }
  });

  it('has no JSON stand-in for caption (details are real columns)', () => {
    const captures = sqlColumns('infra_captures');
    for (const column of ['description', 'room', 'wall', 'infra_type', 'dimensions', 'note', 'role']) {
      expect(captures).toContain(column);
    }
    expect(captures).not.toContain('caption');
  });

  it('is idempotent (every CREATE uses IF NOT EXISTS, constraints/policies/triggers are re-creatable)', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/CREATE\s+TABLE\s+(?!IF NOT EXISTS)/i);
    expect(code).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/i);
  });
});
