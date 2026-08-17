import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  ASSISTANT_TOOL_CATALOG,
  assertAssistantToolAllowed,
  isForbiddenAssistantFinancialAction,
} from '@/modules/assistant/domain/tools';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: ORG_ID,
    membershipId: 'membership-1',
    organization: {
      id: ORG_ID,
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('assistant tools respect permissions and do not post', () => {
  it('every catalog tool is non-mutating for financials', () => {
    expect(ASSISTANT_TOOL_CATALOG.every((tool) => tool.financialMutation === false)).toBe(true);
  });

  it('draft tools are marked draft-only', () => {
    const drafts = ASSISTANT_TOOL_CATALOG.filter(
      (tool) => tool.key === 'prepare_draft_expense' || tool.key === 'prepare_payment_reminder_draft',
    );
    expect(drafts.length).toBe(2);
    expect(drafts.every((tool) => tool.draftOnly)).toBe(true);
  });

  it('refuses posting, paying, approving, and releasing', () => {
    expect(isForbiddenAssistantFinancialAction('post')).toBe(true);
    expect(isForbiddenAssistantFinancialAction('finalize')).toBe(true);
    expect(isForbiddenAssistantFinancialAction('pay')).toBe(true);
    expect(isForbiddenAssistantFinancialAction('approve')).toBe(true);
    expect(isForbiddenAssistantFinancialAction('release_retention')).toBe(true);
    expect(() => assertAssistantToolAllowed(contextWith([PERMISSIONS.ASSISTANT_USE]), 'pay')).toThrow(
      DomainRuleError,
    );
  });

  it('blocks profit explanation without project_profit.read', () => {
    const ctx = contextWith([PERMISSIONS.ASSISTANT_USE, PERMISSIONS.PROJECT_FINANCIALS_READ]);
    expect(() => assertAssistantToolAllowed(ctx, 'explain_project_profit')).toThrow(AuthorizationError);
  });

  it('allows profit explanation with the profit permission', () => {
    const ctx = contextWith([
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.PROJECT_FINANCIALS_READ,
      PERMISSIONS.PROJECT_PROFIT_READ,
    ]);
    expect(assertAssistantToolAllowed(ctx, 'explain_project_profit').key).toBe('explain_project_profit');
  });

  it('blocks clients owing money without billing.read', () => {
    expect(() =>
      assertAssistantToolAllowed(contextWith([PERMISSIONS.ASSISTANT_USE]), 'clients_owing_money'),
    ).toThrow(AuthorizationError);
  });
});
