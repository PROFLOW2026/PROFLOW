import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  path.join(process.cwd(), 'drizzle/migrations/0200_exlfy_evolution_local.sql'),
  'utf8',
);

describe('migration 0200 RLS', () => {
  it('does not grant every org member full access to the new tables', () => {
    expect(sql).not.toMatch(/FOR ALL TO authenticated[\s\S]{0,180}is_org_member\(organization_id\)/);
  });

  it('scopes drawing marks to the project drawing capability', () => {
    expect(sql).toContain("has_project_capability(organization_id, project_id, 'documents.view')");
    expect(sql).toContain("has_project_capability(organization_id, project_id, 'documents.share')");
    expect(sql).toContain('drawing_sheet_marks_revision_org_fk');
    expect(sql).toContain('drawing_sheet_marks_project_org_fk');
  });

  it('splits risk read from projects.update writes', () => {
    expect(sql).toContain("has_project_capability(organization_id, project_id, 'project.view')");
    expect(sql).toContain("has_org_permission(organization_id, 'projects.update')");
    expect(sql).toContain('project_risks_project_org_fk');
  });

  it('lets safety managers write permits and contractors only read', () => {
    expect(sql).toContain("has_org_permission(organization_id, 'safety.manage')");
    expect(sql).toContain("jsonb_exists(g.scopes, 'ext.safety.report')");
    expect(sql).toContain("status = 'draft'");
    expect(sql).toContain('work_permits_project_org_fk');
  });

  it('hides supplier token hashes and email recipients from ordinary members', () => {
    expect(sql).toContain("has_org_permission(organization_id, 'procurement.manage')");
    expect(sql).toContain("has_org_permission(organization_id, 'settings.manage')");
    expect(sql).not.toMatch(/whatsapp_inbound_events[\s\S]{0,400}FOR INSERT TO authenticated/);
    expect(sql).not.toMatch(/notification_email_log[\s\S]{0,400}FOR INSERT TO authenticated/);
  });
});
