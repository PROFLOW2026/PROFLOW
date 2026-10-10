import { describe, expect, it } from 'vitest';
import {
  buildContractorCredentialsShareMessage,
  buildContractorLinkUrl,
  contractorLinkPathForLocale,
} from '@/modules/contractor-access/domain/credentials-share';
import { contractorAccessCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

describe('contractor credentials share', () => {
  it('rewrites link locale segment to match message language', () => {
    const path = '/he-IL/contractor/activate?token=abc';
    expect(contractorLinkPathForLocale(path, 'en')).toBe('/en/contractor/activate?token=abc');
  });

  it('builds invite message with link and username', () => {
    const t = contractorAccessCopyTranslator('en');
    const message = buildContractorCredentialsShareMessage(
      {
        kind: 'invite',
        displayName: 'Avi Cohen',
        organizationName: 'Build Co',
        username: 'avi.cohen',
        linkPath: '/en/contractor/activate?token=secret',
        linkUrl: 'https://app.example/en/contractor/activate?token=secret',
        expiresAt: new Date('2026-12-01T10:00:00Z'),
      },
      t,
      'en',
    );
    expect(message).toContain('Avi Cohen');
    expect(message).toContain('avi.cohen');
    expect(message).toContain('https://app.example/en/contractor/activate?token=secret');
    expect(message).not.toMatch(/Bricks|Mortar|secret123/i);
  });

  it('builds absolute URLs', () => {
    expect(buildContractorLinkUrl('https://app.example', '/he-IL/contractor/activate?token=x')).toBe(
      'https://app.example/he-IL/contractor/activate?token=x',
    );
  });
});
