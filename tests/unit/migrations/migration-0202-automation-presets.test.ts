import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_PRESET_KEYS } from '@/modules/automations/domain/types';

const sql = readFileSync(
  path.join(process.cwd(), 'drizzle/migrations/0202_automation_task_scan_presets.sql'),
  'utf8',
);

describe('migration 0202 automation presets', () => {
  it('extends preset_key CHECK with task_blocked and task_reminder_due', () => {
    expect(sql).toContain("'task_blocked'");
    expect(sql).toContain("'task_reminder_due'");
    for (const key of AUTOMATION_PRESET_KEYS) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it('is additive CHECK replacement only', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS automation_rules_preset_known');
  });
});
