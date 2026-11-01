/**
 * STATIC analysis of the prepared (NOT applied) migration 0195. Pure text parsing - no SQL is executed
 * anywhere, in any database. It checks the things a TypeScript compile cannot:
 *  - every composite foreign key has a matching unique index / primary key on the referenced table
 *    (earlier migrations or 0195 itself), with equal arity and column types;
 *  - references that must be project-aware really include project_id (not organization only);
 *  - guard triggers / policies cover identity, association and contractor-revocation rules;
 *  - basic syntax hygiene (balanced parentheses and dollar-quoting, referenced functions exist).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationsDir = join(root, 'drizzle/migrations');
const strip = (text: string) => text.replace(/--.*$/gm, '');
const sql = strip(readFileSync(join(migrationsDir, '0195_infra_mapping.sql'), 'utf8'));
const earlier = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql') && name < '0195')
  .sort()
  .map((name) => strip(readFileSync(join(migrationsDir, name), 'utf8')))
  .join('\n');

const cols = (list: string) =>
  list
    .split(',')
    .map((part) => part.trim().replace(/"/g, ''))
    .filter(Boolean);
const key = (columns: string[]) => [...columns].sort().join(',');

interface Fk {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}

function foreignKeys(text: string): Fk[] {
  const result: Fk[] = [];
  const pattern =
    /ALTER\s+TABLE\s+public\.(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+public\.(\w+)\s*\(([^)]+)\)([^;]*);/gi;
  for (const match of text.matchAll(pattern)) {
    result.push({
      table: match[1]!,
      name: match[2]!,
      columns: cols(match[3]!),
      refTable: match[4]!,
      refColumns: cols(match[5]!),
      onDelete: (match[6] ?? '').trim(),
    });
  }
  return result;
}

/** table -> set of unique column-set keys (primary key `id`, unique indexes, UNIQUE constraints). */
function uniqueKeys(text: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (table: string, columns: string[]) => {
    const set = map.get(table) ?? new Set<string>();
    set.add(key(columns));
    map.set(table, set);
  };
  for (const match of text.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s+ON\s+(?:ONLY\s+)?(?:public\.)?"?(\w+)"?\s*\(([^)]+)\)(\s+WHERE)?/gi)) {
    if (match[3]) continue; // partial unique indexes cannot be foreign-key targets
    add(match[1]!, cols(match[2]!));
  }
  for (const match of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)\s*\(/gi)) add(match[1]!, ['id']);
  for (const match of text.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?public\.(\w+)\s+ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(([^)]+)\)/gi)) {
    add(match[1]!, cols(match[2]!));
  }
  for (const match of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    for (const unique of match[2]!.matchAll(/UNIQUE\s*\(([^)]+)\)/gi)) add(match[1]!, cols(unique[1]!));
  }
  return map;
}

function tableColumns(text: string, table: string): Map<string, string> {
  const start = text.search(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}\\s*\\(`, 'i'));
  if (start < 0) return new Map();
  const end = text.indexOf('\n);', start);
  const result = new Map<string, string>();
  for (const line of text.slice(start, end).split('\n').slice(1)) {
    const match = /^\s{2}"?([a-z_0-9]+)"?\s+(uuid|text|integer|boolean|timestamptz|jsonb|bigint)\b/i.exec(line);
    if (match) result.set(match[1]!, match[2]!.toLowerCase());
  }
  return result;
}

const fks = foreignKeys(sql);
const uniquesBefore = uniqueKeys(earlier);
const uniquesHere = uniqueKeys(sql);
const INFRA = ['infra_folder_mappings', 'infra_captures', 'infra_capture_versions', 'infra_markings', 'infra_comparisons'];

function hasUniqueTarget(table: string, columns: string[]): boolean {
  const wanted = key(columns);
  return Boolean(uniquesBefore.get(table)?.has(wanted) || uniquesHere.get(table)?.has(wanted));
}

describe('0195 foreign keys (static analysis, nothing executed)', () => {
  it('finds the expected set of keys and the analyzer can tell a missing target from a present one', () => {
    expect(fks.length).toBe(21);
    for (const fk of fks) expect(fk.columns.length, fk.name).toBe(fk.refColumns.length);
    // sanity: tasks only has (id, organization_id) - a project-pinned key would NOT be satisfiable, which is
    // exactly why the task link is a trigger and not a composite FK.
    expect(hasUniqueTarget('tasks', ['id', 'organization_id'])).toBe(true);
    expect(hasUniqueTarget('tasks', ['id', 'organization_id', 'project_id'])).toBe(false);
    expect(hasUniqueTarget('evidence_items', ['id', 'organization_id', 'project_id'])).toBe(true);
    expect(uniquesBefore.get('evidence_items')?.has(key(['id', 'organization_id', 'project_id']))).toBeFalsy();
  });

  it('no foreign key references tasks with a project-pinned key (would block task moves)', () => {
    for (const fk of fks.filter((item) => item.refTable === 'tasks')) {
      expect(fk.refColumns).toEqual(['id', 'organization_id']);
    }
  });

  it('every foreign key points at an existing primary key / unique index with the same columns', () => {
    for (const fk of fks) {
      expect(hasUniqueTarget(fk.refTable, fk.refColumns), `${fk.name} -> ${fk.refTable}(${fk.refColumns.join(', ')})`).toBe(true);
    }
  });

  it('referenced columns exist and have the same type as the referencing columns (infra tables)', () => {
    for (const fk of fks) {
      if (!INFRA.includes(fk.table) || !INFRA.includes(fk.refTable)) continue;
      const own = tableColumns(sql, fk.table);
      const target = tableColumns(sql, fk.refTable);
      fk.columns.forEach((column, index) => {
        const refColumn = fk.refColumns[index]!;
        expect(own.get(column), `${fk.name}: ${fk.table}.${column}`).toBeDefined();
        expect(target.get(refColumn), `${fk.name}: ${fk.refTable}.${refColumn}`).toBeDefined();
        expect(own.get(column), `${fk.name} type`).toBe(target.get(refColumn));
      });
    }
  });

  it('ON DELETE SET NULL column lists name only referencing columns that are nullable', () => {
    for (const fk of fks) {
      const match = /ON\s+DELETE\s+SET\s+NULL\s*\(([^)]+)\)/i.exec(fk.onDelete);
      if (!match) continue;
      const own = fk.table;
      const text = sql;
      for (const column of cols(match[1]!)) {
        expect(fk.columns, `${fk.name} sets ${column}`).toContain(column);
        const definition = new RegExp(`public\\.${own}[\\s\\S]*?\\n\\s{2}"?${column}"?\\s+\\w+([^,\\n]*)`, 'i').exec(text);
        expect(definition?.[1] ?? '', `${fk.name}: ${column} must be nullable`).not.toMatch(/NOT NULL/i);
      }
    }
  });

  it('references to evidence / captures / versions / locations pin the PROJECT, not just the organization', () => {
    const mustPinProject = ['evidence_items', 'infra_captures', 'infra_capture_versions', 'project_locations'];
    for (const fk of fks) {
      if (!mustPinProject.includes(fk.refTable)) continue;
      expect(fk.refColumns, `${fk.name} referenced columns`).toContain('project_id');
      expect(fk.columns, `${fk.name} referencing columns`).toContain('project_id');
      expect(fk.refColumns, `${fk.name} referenced columns`).toContain('organization_id');
    }
  });

  it('every marking is bound to a version of ITS OWN capture (same organization and project)', () => {
    const fk = fks.find((item) => item.name === 'infra_markings_version_fk')!;
    expect(fk).toBeDefined();
    expect(key(fk.columns)).toBe(key(['version_id', 'capture_id', 'organization_id', 'project_id']));
    expect(key(fk.refColumns)).toBe(key(['id', 'capture_id', 'organization_id', 'project_id']));
    expect(fks.some((item) => item.name === 'infra_markings_capture_fk')).toBe(false);
  });

  it('comparisons: before / after / result and location are project-aware', () => {
    for (const name of ['infra_comparisons_before_fk', 'infra_comparisons_after_fk', 'infra_comparisons_result_fk', 'infra_comparisons_location_fk']) {
      const fk = fks.find((item) => item.name === name)!;
      expect(fk, name).toBeDefined();
      expect(fk.columns, name).toEqual(expect.arrayContaining(['organization_id', 'project_id']));
    }
  });

  it('adds exactly one object on an existing table: the evidence_items unique index', () => {
    const onExisting = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+public\.(\w+)/gi)]
      .filter((match) => !match[2]!.startsWith('infra_'))
      .map((match) => match[1]);
    expect(onExisting).toEqual(['evidence_items_id_organization_id_project_id_uq']);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.(?!infra_)\w+/i);
  });
});

describe('0195 guard triggers and the task link', () => {
  const fn = (name: string) => {
    const match = new RegExp(`FUNCTION\\s+app\\.${name}\\(\\)[\\s\\S]*?\\$fn\\$;`, 'i').exec(sql);
    expect(match, name).not.toBeNull();
    return match![0];
  };

  it('every trigger calls a function defined in the migration', () => {
    const defined = new Set([...sql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+app\.(\w+)\(/gi)].map((m) => m[1]));
    const called = [...sql.matchAll(/EXECUTE\s+FUNCTION\s+app\.(\w+)\(\)/gi)].map((m) => m[1]!);
    expect(called.length).toBeGreaterThanOrEqual(8);
    for (const name of called) expect(defined.has(name), name).toBe(true);
  });

  it('comparison identity and association columns are protected', () => {
    const body = fn('infra_comparisons_guard');
    for (const column of ['organization_id', 'project_id', 'location_id', 'client_comparison_id', 'mode', 'created_by_actor_type', 'created_by_principal_id', 'vendor_id', 'created_at']) {
      expect(body, column).toContain(`NEW.${column}`);
      expect(body, column).toContain(`OLD.${column}`);
    }
    for (const column of ['task_id', 'before_capture_id', 'after_capture_id', 'result_evidence_id']) {
      expect(body, column).toContain(`NEW.${column}`);
    }
    expect(sql).toMatch(/CREATE TRIGGER infra_comparisons_guard\s+BEFORE UPDATE ON public\.infra_comparisons/i);
  });

  it('capture identity (incl. evidence and organization/project) is protected', () => {
    const body = fn('infra_captures_guard');
    for (const column of ['organization_id', 'project_id', 'evidence_id', 'created_by_actor_type', 'created_by_principal_id', 'vendor_id']) {
      expect(body, column).toContain(`NEW.${column}`);
    }
  });

  it('a linked task must belong to the same organization and project (captures and comparisons)', () => {
    const body = fn('infra_task_link_guard');
    expect(body).toMatch(/t\.organization_id\s*=\s*NEW\.organization_id/);
    expect(body).toMatch(/t\.project_id\s*=\s*NEW\.project_id/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path/);
    for (const table of ['infra_captures', 'infra_comparisons']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${table}_task_link\\s+BEFORE INSERT OR UPDATE OF task_id, project_id, organization_id ON public\\.${table}`, 'i'));
    }
  });

  it('an annotated version file can never be an original capture file (and vice versa)', () => {
    const body = fn('infra_evidence_role_guard');
    expect(body).toMatch(/infra_capture_versions v WHERE v\.annotated_evidence_id = NEW\.evidence_id/);
    expect(body).toMatch(/infra_captures c WHERE c\.evidence_id = NEW\.annotated_evidence_id/);
  });

  it('append-only tables stay append-only', () => {
    for (const table of ['infra_capture_versions', 'infra_markings']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${table}_append_only\\s+BEFORE UPDATE ON public\\.${table}`, 'i'));
    }
  });
});

describe('0195 row-level security', () => {
  const policies = [...sql.matchAll(/CREATE\s+POLICY\s+(\w+)\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)\s+TO\s+(\w+)([\s\S]*?);(?=\s*(?:--|DROP|CREATE|GRANT|ALTER|$))/gi)].map((m) => ({
    name: m[1]!,
    table: m[2]!,
    command: m[3]!.toUpperCase(),
    role: m[4]!,
    body: m[5]!,
  }));
  const external = (policy: { body: string }) => policy.body.includes('external_principal_id');
  const authenticated = policies.filter((policy) => policy.role === 'authenticated');

  it('parses every policy', () => {
    expect(policies.length).toBeGreaterThanOrEqual(20);
  });

  it('every UPDATE policy has a WITH CHECK', () => {
    for (const policy of authenticated.filter((item) => item.command === 'UPDATE')) {
      expect(policy.body, policy.name).toMatch(/WITH CHECK/i);
    }
  });

  it('contractor INSERT / UPDATE on comparisons and captures re-checks the ACTIVE grant (USING and WITH CHECK)', () => {
    for (const table of ['infra_comparisons', 'infra_captures']) {
      for (const command of ['INSERT', 'UPDATE']) {
        const policy = authenticated.find((item) => item.table === table && item.command === command && external(item));
        expect(policy, `${table} ${command} external`).toBeDefined();
        const scoped = (policy!.body.match(/app\.external_has_scope\(/g) ?? []).length;
        expect(scoped, `${policy!.name} scope checks`).toBeGreaterThanOrEqual(command === 'UPDATE' ? 2 : 1);
        expect(policy!.body, policy!.name).toMatch(/ext\.document\.upload/);
        expect(policy!.body, policy!.name).toMatch(/docs_external_capability/);
      }
    }
  });

  it('contractor SELECT on comparisons requires an active view/upload grant, not just authorship', () => {
    const policy = authenticated.find((item) => item.name === 'infra_comparisons_select')!;
    expect(policy.body).toMatch(/external_has_scope\([^)]*'ext\.document\.view'\)/);
    expect(policy.body).toMatch(/external_has_scope\([^)]*'ext\.document\.upload'\)/);
    expect(policy.body).toMatch(/docs_external_capability\([^)]*'ext\.document\.view'\)/);
    // the author branch is never a bare `created_by_principal_id = ...` without the grant check
    const externalBranch = policy.body.slice(policy.body.indexOf("created_by_actor_type = 'external'"));
    expect(externalBranch).toMatch(/external_has_scope/);
  });

  it('contractor reading their own capture also needs an active grant; evidence project must match', () => {
    const policy = authenticated.find((item) => item.name === 'infra_captures_select')!;
    expect(policy.body).toMatch(/e\.project_id\s*=\s*infra_captures\.project_id/);
    expect(policy.body).toMatch(/external_has_scope/);
  });

  it('contractor inserts of versions and markings require an active upload grant', () => {
    for (const name of ['infra_capture_versions_insert', 'infra_markings_insert']) {
      const policy = authenticated.find((item) => item.name === name)!;
      expect(policy.body, name).toMatch(/external_has_scope\([^)]*'ext\.document\.upload'\)/);
    }
  });

  it('versions and markings are matched on organization AND project inside their policies', () => {
    for (const name of ['infra_capture_versions_select', 'infra_capture_versions_insert', 'infra_markings_select', 'infra_markings_insert']) {
      const policy = authenticated.find((item) => item.name === name)!;
      expect(policy.body, name).toMatch(/project_id\s*=\s*infra_\w+\.project_id/);
    }
  });

  it('every table keeps forced RLS and a service-role policy', () => {
    for (const table of INFRA) {
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(policies.some((policy) => policy.table === table && policy.role === 'service_role')).toBe(true);
    }
  });
});

describe('0195 syntax hygiene', () => {
  it('has balanced parentheses and an even number of $fn$ delimiters', () => {
    expect((sql.match(/\$fn\$/g) ?? []).length % 2).toBe(0);
    const withoutLiterals = sql.replace(/'(?:[^']|'')*'/g, "''");
    expect((withoutLiterals.match(/\(/g) ?? []).length).toBe((withoutLiterals.match(/\)/g) ?? []).length);
  });

  it('every statement outside function bodies ends with a semicolon', () => {
    const outside = sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '$fn$ $fn$');
    const statements = outside
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      expect(statement, statement.slice(0, 80)).toMatch(/^(CREATE|ALTER|DROP|GRANT|REVOKE)\b/i);
    }
  });

  it('every ADD CONSTRAINT is preceded by DROP CONSTRAINT IF EXISTS (re-runnable)', () => {
    for (const fk of fks) {
      expect(sql, fk.name).toContain(`DROP CONSTRAINT IF EXISTS ${fk.name};`);
    }
  });

  it('uses only features available on PostgreSQL 15 (ON DELETE SET NULL (column list) is the newest)', () => {
    expect(sql).not.toMatch(/\bMERGE\b|\bNULLS NOT DISTINCT\b|\bSECURITY INVOKER\b|\bjson_table\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+POLICY\b[^;]*\bAS\s+RESTRICTIVE\b/i);
  });
});
