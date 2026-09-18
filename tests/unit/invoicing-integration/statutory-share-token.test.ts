import { describe, expect, it } from 'vitest';
import {
  createStatutoryShareToken,
  verifyStatutoryShareToken,
} from '@/modules/invoicing-integration/application/statutory-share-token';

describe('statutory share token', () => {
  it('round-trips organization and document ids', () => {
    const token = createStatutoryShareToken({
      organizationId: 'b1460c82-36cd-429a-b30d-ea5644d58fe3',
      externalDocumentId: 'doc-uuid',
    });
    const verified = verifyStatutoryShareToken(token);
    expect(verified.organizationId).toBe('b1460c82-36cd-429a-b30d-ea5644d58fe3');
    expect(verified.externalDocumentId).toBe('doc-uuid');
  });

  it('rejects tampered tokens', () => {
    const token = createStatutoryShareToken({
      organizationId: 'org',
      externalDocumentId: 'doc',
    });
    expect(() => verifyStatutoryShareToken(`${token}x`)).toThrow();
  });
});
