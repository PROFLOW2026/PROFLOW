import { describe, expect, it } from 'vitest';
import {
  canSeeDocumentPrivacyClass,
  canSeeProjectLinkedDocument,
  resolveUploadPrivacyClass,
} from '@/modules/documents/domain/privacy';

describe('document compensation privacy', () => {
  it('hides compensation files unless workforce.cost.read is granted (fail closed)', () => {
    expect(canSeeDocumentPrivacyClass('compensation', false)).toBe(false);
    expect(canSeeDocumentPrivacyClass('compensation', undefined as unknown as boolean)).toBe(false);
    expect(canSeeDocumentPrivacyClass('compensation', true)).toBe(true);
    expect(canSeeDocumentPrivacyClass('standard', false)).toBe(true);
    expect(canSeeDocumentPrivacyClass(null, false)).toBe(true);
  });

  it('only marks compensation when the owner is an employee and cost.read is held', () => {
    expect(
      resolveUploadPrivacyClass({
        ownerType: 'employee',
        requested: 'compensation',
        canReadWorkforceCost: true,
      }),
    ).toBe('compensation');
    expect(
      resolveUploadPrivacyClass({
        ownerType: 'employee',
        requested: 'compensation',
        canReadWorkforceCost: false,
      }),
    ).toBe('standard');
    expect(
      resolveUploadPrivacyClass({
        ownerType: 'project',
        requested: 'compensation',
        canReadWorkforceCost: true,
      }),
    ).toBe('standard');
    expect(
      resolveUploadPrivacyClass({
        ownerType: 'employee',
        requested: undefined,
        canReadWorkforceCost: true,
      }),
    ).toBe('standard');
  });
});

describe('project-linked document visibility', () => {
  it('treats a null allow-list as unrestricted', () => {
    expect(canSeeProjectLinkedDocument(['proj-b'], null)).toBe(true);
  });

  it('keeps documents with no project links visible under a restricted allow-list', () => {
    expect(canSeeProjectLinkedDocument([], ['proj-a'])).toBe(true);
  });

  it('hides documents linked to a project outside the allow-list', () => {
    expect(canSeeProjectLinkedDocument(['proj-a'], ['proj-a'])).toBe(true);
    expect(canSeeProjectLinkedDocument(['proj-b'], ['proj-a'])).toBe(false);
    expect(canSeeProjectLinkedDocument(['proj-a', 'proj-b'], ['proj-a'])).toBe(false);
  });
});
