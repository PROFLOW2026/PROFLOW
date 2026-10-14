import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const { withOrgContextMock, createStatutoryShareLinkForDocumentMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
  createStatutoryShareLinkForDocumentMock: vi.fn(),
}));

vi.mock('@/shared/auth/session', () => ({
  withOrgContext: (fn: (ctx: OrgContext) => Promise<unknown>) => withOrgContextMock(fn),
}));

vi.mock('@/modules/invoicing-integration/application/manage-statutory-share-links', () => ({
  createStatutoryShareLinkForDocument: (...args: unknown[]) =>
    createStatutoryShareLinkForDocumentMock(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createStatutoryShareLinkAction } from '@/modules/invoicing-integration/ui/actions';

const baseContext = {
  organizationId: 'org-1',
  permissions: new Set([PERMISSIONS.BILLING_READ]),
} as unknown as OrgContext;

describe('createStatutoryShareLinkAction authz (B04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOrgContextMock.mockImplementation(async (fn: (ctx: OrgContext) => Promise<unknown>) =>
      fn(baseContext),
    );
  });

  it('rejects users without billing.manage', async () => {
    const result = await createStatutoryShareLinkAction('doc-1');
    expect(result.error).toBeTruthy();
    expect(createStatutoryShareLinkForDocumentMock).not.toHaveBeenCalled();
  });

  it('returns share URL when user can manage billing', async () => {
    withOrgContextMock.mockImplementation(async (fn: (ctx: OrgContext) => Promise<unknown>) =>
      fn({
        ...baseContext,
        permissions: new Set([PERMISSIONS.BILLING_MANAGE]),
      } as OrgContext),
    );
    createStatutoryShareLinkForDocumentMock.mockResolvedValue({
      shareUrl: 'https://example.test/share/token',
    });
    const result = await createStatutoryShareLinkAction('doc-1');
    expect(result.shareUrl).toBe('https://example.test/share/token');
    expect(result.error).toBeUndefined();
  });

  it('maps share degraded mode to shareUnavailable', async () => {
    withOrgContextMock.mockImplementation(async (fn: (ctx: OrgContext) => Promise<unknown>) =>
      fn({
        ...baseContext,
        permissions: new Set([PERMISSIONS.BILLING_MANAGE]),
      } as OrgContext),
    );
    createStatutoryShareLinkForDocumentMock.mockRejectedValue(
      new DomainRuleError(
        'Statutory share unavailable',
        'invoicingIntegration.errors.shareUnavailable',
      ),
    );
    const result = await createStatutoryShareLinkAction('doc-1');
    expect(result.error).toBeTruthy();
    expect(result.shareUrl).toBeUndefined();
  });

  it('maps missing document to not found', async () => {
    withOrgContextMock.mockImplementation(async (fn: (ctx: OrgContext) => Promise<unknown>) =>
      fn({
        ...baseContext,
        permissions: new Set([PERMISSIONS.BILLING_MANAGE]),
      } as OrgContext),
    );
    createStatutoryShareLinkForDocumentMock.mockRejectedValue(
      new DomainRuleError('not found', 'errors.notFound'),
    );
    const result = await createStatutoryShareLinkAction('missing');
    expect(result.error).toBeTruthy();
  });
});
