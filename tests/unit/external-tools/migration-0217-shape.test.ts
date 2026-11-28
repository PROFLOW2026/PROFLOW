import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(join(root, 'drizzle/migrations/0217_external_professional_tools.sql'), 'utf8');
const previous = readFileSync(join(root, 'drizzle/migrations/0205_electrical_takeoff.sql'), 'utf8');
const older = readFileSync(join(root, 'drizzle/migrations/0156_dg_external_identity.sql'), 'utf8');

function scopes(sql: string): string[] {
  const match = sql.match(/CREATE OR REPLACE FUNCTION app\.external_scopes_valid[\s\S]*?\$fn\$;/);
  if (!match) return [];
  return [...match[0].matchAll(/'(ext\.[^']+)'/g)].map((item) => item[1] ?? '').filter(Boolean).sort();
}

describe('migration 0217 shape', () => {
  it('includes every session field the plan named', () => {
    for (const column of [
      'actor_kind',
      'principal_id',
      'worker_lease_until',
      'last_heartbeat_at',
      'stage',
      'percent',
      'message',
      'source_token_hash',
      'result_token_hash',
      'progress_token_hash',
      'terminal_token_hash',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('includes file, part, xref, object, edit and stream constraints', () => {
    for (const token of [
      'upload_state',
      'part_count',
      'upload_url_issued_at',
      'offset_bytes',
      'external_tool_parts_file_fk',
      'external_tool_parts_offset_uq',
      'external_tool_parts_locked_key',
      'host_logical_id',
      'external_tool_xrefs_parent_fk',
      'external_tool_xrefs_resolved_fk',
      'issued_at',
      'last_error',
      'ON DELETE SET NULL',
      'external_tool_edits_pk',
      'external_tool_streams_pk',
    ]) {
      expect(migration).toContain(token);
    }
    const withoutComments = migration.replace(/--[^\n]*/g, '');
    expect(withoutComments).not.toContain('project_id');
  });

  it('keeps every scope from the previous function and adds only the two tool scopes', () => {
    const before = scopes(previous);
    const after = scopes(migration);
    for (const scope of scopes(older)) expect(after).toContain(scope);
    for (const scope of before) expect(after).toContain(scope);
    expect(after.filter((scope) => !before.includes(scope)).sort()).toEqual(['ext.tools.takeoff', 'ext.tools.viewer']);
  });
});
