import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTRACT_TYPES } from '@/modules/projects';
import {
  canTransitionContractStatus,
  contractStatusActions,
  isTerminalContractStatus,
} from '@/modules/projects/domain/contract-lifecycle';
import {
  createAdditionalContractSchema,
  updateContractSchema,
} from '@/modules/projects/validation/schemas';

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

  it('edits metadata without an original-amount field', () => {
    const parsed = updateContractSchema.parse({
      contractId: randomUUID(),
      name: 'Facade package revised',
      contractType: 'secondary',
      contractNumber: 'C-2',
      startDate: '2026-02-01',
      endDate: '2026-12-31',
      retentionPercent: '5',
      notes: 'Site extra',
      status: 'closed',
    });
    expect(parsed.name).toBe('Facade package revised');
    expect(parsed.contractType).toBe('secondary');
    expect(parsed.status).toBe('closed');
    expect(parsed).not.toHaveProperty('enteredAmount');
    expect(parsed).not.toHaveProperty('originalValueAmount');
  });

  it('rejects rewriting type to primary through the edit schema', () => {
    const parsed = updateContractSchema.safeParse({
      contractId: randomUUID(),
      contractType: 'primary',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('contract status lifecycle', () => {
  it('allows close and cancel from active, not from cancelled', () => {
    expect(canTransitionContractStatus('active', 'closed')).toBe(true);
    expect(canTransitionContractStatus('active', 'cancelled')).toBe(true);
    expect(canTransitionContractStatus('cancelled', 'active')).toBe(false);
    expect(canTransitionContractStatus('closed', 'cancelled')).toBe(false);
    expect(contractStatusActions('active')).toEqual(['closed', 'cancelled']);
    expect(contractStatusActions('closed')).toEqual([]);
  });

  it('treats closed and cancelled as historical, not current commercial life', () => {
    expect(isTerminalContractStatus('draft')).toBe(false);
    expect(isTerminalContractStatus('active')).toBe(false);
    expect(isTerminalContractStatus('closed')).toBe(true);
    expect(isTerminalContractStatus('cancelled')).toBe(true);
  });
});
