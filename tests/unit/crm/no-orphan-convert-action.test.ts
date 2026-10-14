import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertWonOpportunitySchema } from '@/modules/crm/validation/schemas';

describe('CRM orphan convert action cleanup (U04)', () => {
  it('crm/actions.ts does not export convertWonOpportunityAction', () => {
    const source = readFileSync('src/app/[locale]/(app)/crm/actions.ts', 'utf8');
    expect(source).not.toMatch(/export async function convertWonOpportunityAction/);
  });

  it('convertWonOpportunitySchema has no salesQuoteVersionId', () => {
    expect(convertWonOpportunitySchema.safeParse({ opportunityId: crypto.randomUUID() }).success).toBe(
      true,
    );
    expect(convertWonOpportunitySchema.shape).not.toHaveProperty('salesQuoteVersionId');
  });
});
