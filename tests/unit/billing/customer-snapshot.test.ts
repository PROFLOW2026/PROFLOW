import { describe, expect, it } from 'vitest';
import {
  captureCustomerSnapshot,
  resolveCustomerNoVat,
} from '@/modules/billing/domain/customer-snapshot';
import type { ClientRecord, PartyIdentifierRecord } from '@/modules/clients/domain/types';

function client(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'client-1',
    organizationId: 'org-1',
    name: 'אופק בנייה ויזמות בע״מ',
    legalName: 'אופק בנייה ויזמות בע״מ',
    email: null,
    phone: null,
    website: null,
    addressLine1: 'רחוב המלאכה 14',
    addressLine2: null,
    city: 'ראשון לציון',
    region: null,
    postalCode: '7531234',
    countryCode: 'IL',
    notes: null,
    status: 'active',
    clientTypeId: null,
    defaultPaymentTermId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('captureCustomerSnapshot', () => {
  it('does not mark noVat when company number is absent but billing is VAT-exclusive', () => {
    const snapshot = captureCustomerSnapshot(client(), [], { billingVatMode: 'exclusive' });
    expect(snapshot.companyNumber).toBeNull();
    expect(snapshot.noVat).toBe(false);
  });

  it('marks noVat only for zero-VAT billing semantics', () => {
    expect(resolveCustomerNoVat('zero')).toBe(true);
    expect(resolveCustomerNoVat('exclusive')).toBe(false);
    expect(resolveCustomerNoVat('inclusive')).toBe(false);
  });

  it('preserves company number without forcing noVat false incorrectly', () => {
    const identifiers: PartyIdentifierRecord[] = [
      {
        id: 'id-1',
        organizationId: 'org-1',
        clientId: 'client-1',
        vendorId: null,
        type: 'company_number',
        value: '512345678',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const snapshot = captureCustomerSnapshot(client(), identifiers, { billingVatMode: 'exclusive' });
    expect(snapshot.companyNumber).toBe('512345678');
    expect(snapshot.noVat).toBe(false);
  });
});
