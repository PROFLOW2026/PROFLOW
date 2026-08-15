import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTRACT_TYPES } from '@/modules/projects';
import { createAdditionalContractSchema } from '@/modules/projects/validation/schemas';

describe('additional contract domain', () => {
  it('exposes primary | additional | secondary kinds', () => {
    expect(CONTRACT_TYPES).toEqual(['primary', 'additional', 'secondary']);
  });

  it('does not allow creating an additional contract as primary', () => {
    const parsed = createAdditionalContractSchema.safeParse({
      projectId: randomUUID(),
      contractType: 'primary',
      enteredAmount: '1000',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts additional create without replacing a primary flag in the payload', () => {
    const parsed = createAdditionalContractSchema.parse({
      projectId: randomUUID(),
      contractType: 'additional',
      name: 'Facade package',
      enteredAmount: '40000',
    });
    expect(parsed.contractType).toBe('additional');
    expect(parsed).not.toHaveProperty('isPrimary');
  });
});
