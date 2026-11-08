import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0197_employee_notification_access.sql', 'utf8');

describe('0197 employee notification access', () => {
  it('lets an active employee read and cache only their own rows', () => {
    expect(sql).toContain("account.status = 'active'");
    expect(sql).toContain('recipient_user_id = app.current_user_id()');
    expect(sql).toContain('user_id = app.current_user_id()');
    expect(sql).not.toMatch(/GRANT[^\n]*crm\.manage/);
  });

  it('defines the linked opportunity and principal display functions', () => {
    expect(sql).toContain('app.mark_linked_opportunity_won');
    expect(sql).toContain('app.external_principal_display_name');
    expect(sql).toContain('PREPARED ONLY');
  });
});
