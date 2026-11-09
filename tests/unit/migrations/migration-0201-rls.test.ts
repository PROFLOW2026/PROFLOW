import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  path.join(process.cwd(), 'drizzle/migrations/0201_planning_baselines_project_goals.sql'),
  'utf8',
);

describe('migration 0201 RLS', () => {
  it('marks the file prepared only', () => {
    expect(sql).toMatch(/PREPARED ONLY/i);
  });

  it('scopes baseline reads to planning.read and writes to planning.write without update policies', () => {
    expect(sql).toContain("has_org_permission(organization_id, 'planning.read')");
    expect(sql).toContain("has_org_permission(organization_id, 'planning.write')");
    expect(sql).toContain('planning_schedule_baselines_project_org_fk');
    expect(sql).not.toMatch(/planning_schedule_baselines_update/);
    expect(sql).not.toMatch(/planning_schedule_baseline_snapshots_update/);
    expect(sql).toContain('GRANT SELECT, INSERT ON public.planning_schedule_baselines TO authenticated');
  });

  it('creates baseline id/org/project unique index before snapshot baseline FK', () => {
    const indexPos = sql.indexOf('planning_schedule_baselines_id_org_project_uq');
    const snapshotTablePos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.planning_schedule_baseline_snapshots');
    const baselineFkPos = sql.indexOf('planning_schedule_baseline_snapshots_baseline_org_project_fk');
    expect(indexPos).toBeGreaterThan(-1);
    expect(snapshotTablePos).toBeGreaterThan(indexPos);
    expect(baselineFkPos).toBeGreaterThan(snapshotTablePos);
    expect(sql).toContain(
      'FOREIGN KEY (baseline_id, organization_id, project_id)',
    );
    expect(sql).toContain(
      'REFERENCES public.planning_schedule_baselines (id, organization_id, project_id)',
    );
    expect(sql).not.toContain('planning_schedule_baseline_snapshots_baseline_org_fk');
  });

  it('splits project goal reads from dual write permissions', () => {
    expect(sql).toContain("has_project_capability(organization_id, project_id, 'project.view')");
    expect(sql).toContain("has_org_permission(organization_id, 'projects.update')");
    expect(sql).toContain("has_org_permission(organization_id, 'planning.write')");
    expect(sql).toContain('project_goals_project_org_fk');
  });
});
