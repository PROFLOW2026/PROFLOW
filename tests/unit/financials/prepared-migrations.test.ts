import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const owner = readFileSync('drizzle/migrations/0198_owner_closed_period_source_edit.sql', 'utf8');
const warnings = readFileSync('drizzle/migrations/0199_duplicate_warnings_and_auth_rate_limits.sql', 'utf8');

describe('prepared closed-period and warning migrations', () => {
  it('lets only an organization owner through the closed-period guards', () => {
    expect(owner).toContain('CREATE OR REPLACE FUNCTION app.is_organization_owner');
    expect(owner).toContain("COALESCE(role.template_key, role.key) = 'owner'");
    expect(owner).toContain('app.current_user_id() IS NOT NULL');
    expect(owner).toContain('CREATE OR REPLACE FUNCTION app.closed_period_rewrite_guard');
    expect(owner).toContain('CREATE OR REPLACE FUNCTION app.expenses_closed_period_guard_v2');
    expect(owner).toContain('PREPARED ONLY');
    expect(owner).not.toContain('UPDATE public.expenses');
  });

  it('stores pending warnings and hashed rate limits without a raw email', () => {
    expect(warnings).toContain('duplicate_warning_acknowledgements');
    expect(warnings).toContain("status IN ('pending', 'acknowledged')");
    expect(warnings).toContain("status = 'pending'");
    expect(warnings).toContain('approver_user_id IS NULL');
    expect(warnings).toContain('REVOKE DELETE ON public.duplicate_warning_acknowledgements FROM authenticated');
    expect(warnings).toContain('CREATE OR REPLACE FUNCTION app.consume_auth_rate_limit');
    expect(warnings).toContain("position('@' in p_key_hash)");
    expect(warnings).not.toContain('email text');
  });
});
