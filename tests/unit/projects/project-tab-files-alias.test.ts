import { describe, expect, it } from 'vitest';
import { resolveHubFromTabParam } from '@/app/[locale]/(app)/projects/[projectId]/project-hub-order';

describe('project tab aliases (U09 NF-UX-14)', () => {
  it('maps legacy ?tab=files to documents hub', () => {
    expect(resolveHubFromTabParam('files')).toEqual({
      hub: 'documents',
      section: 'documents',
    });
  });
});
