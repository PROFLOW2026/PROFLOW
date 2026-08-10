import { describe, expect, it } from 'vitest';
import {
  contactBelongsToClient,
  pickPracticalClientContact,
  resolveProjectDisplayContact,
} from '@/modules/clients/domain/practical-contact';
import type { ClientContactRecord } from '@/modules/clients/domain/types';
import { createClientSchema } from '@/modules/clients/validation/schemas';
import { createProjectSchema } from '@/modules/projects/validation/schemas';

function contact(
  overrides: Partial<ClientContactRecord> & Pick<ClientContactRecord, 'id' | 'name' | 'role'>,
): ClientContactRecord {
  return {
    organizationId: '11111111-1111-4111-8111-111111111111',
    clientId: '22222222-2222-4222-8222-222222222222',
    email: null,
    phone: null,
    notes: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('createClientSchema primary contact', () => {
  it('allows company-only create without a contact person', () => {
    const parsed = createClientSchema.safeParse({ name: 'Cohen Ltd' });
    expect(parsed.success).toBe(true);
  });

  it('requires contact person name and phone together', () => {
    const missingPhone = createClientSchema.safeParse({
      name: 'Cohen Ltd',
      primaryContactName: 'Dana',
    });
    expect(missingPhone.success).toBe(false);

    const missingName = createClientSchema.safeParse({
      name: 'Cohen Ltd',
      primaryContactPhone: '050-1111111',
    });
    expect(missingName.success).toBe(false);
  });

  it('accepts company plus primary contact person fields', () => {
    const parsed = createClientSchema.safeParse({
      name: 'Cohen Ltd',
      phone: '03-1111111',
      primaryContactName: 'Dana Cohen',
      primaryContactPhone: '050-1111111',
      primaryContactEmail: 'dana@example.com',
      primaryContactRole: 'primary',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.phone).toBe('03-1111111');
    expect(parsed.data.primaryContactName).toBe('Dana Cohen');
    expect(parsed.data.primaryContactPhone).toBe('050-1111111');
  });
});

describe('pickPracticalClientContact', () => {
  it('prefers primary role over earlier non-primary contacts', () => {
    const picked = pickPracticalClientContact([
      contact({
        id: '33333333-3333-4333-8333-333333333331',
        name: 'Site',
        role: 'site',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      contact({
        id: '33333333-3333-4333-8333-333333333332',
        name: 'Primary',
        role: 'primary',
        phone: '050-2222222',
        createdAt: new Date('2024-06-01T00:00:00.000Z'),
      }),
    ]);
    expect(picked?.name).toBe('Primary');
    expect(picked?.phone).toBe('050-2222222');
  });

  it('falls back to earliest contact when no primary exists', () => {
    const picked = pickPracticalClientContact([
      contact({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Later',
        role: 'billing',
        createdAt: new Date('2024-06-01T00:00:00.000Z'),
      }),
      contact({
        id: '33333333-3333-4333-8333-333333333334',
        name: 'Earlier',
        role: 'site',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(picked?.name).toBe('Earlier');
  });

  it('returns null for an empty list', () => {
    expect(pickPracticalClientContact([])).toBeNull();
  });
});

describe('resolveProjectDisplayContact', () => {
  it('prefers project-specific contact over client practical primary', () => {
    const projectContact = contact({
      id: '33333333-3333-4333-8333-333333333341',
      name: 'Site Lead',
      role: 'site',
    });
    const clientPrimary = contact({
      id: '33333333-3333-4333-8333-333333333342',
      name: 'Client Primary',
      role: 'primary',
    });
    const resolved = resolveProjectDisplayContact(projectContact, [clientPrimary, projectContact]);
    expect(resolved?.id).toBe(projectContact.id);
  });

  it('falls back to client practical primary when project contact unset', () => {
    const clientPrimary = contact({
      id: '33333333-3333-4333-8333-333333333343',
      name: 'Client Primary',
      role: 'primary',
    });
    const resolved = resolveProjectDisplayContact(null, [clientPrimary]);
    expect(resolved?.id).toBe(clientPrimary.id);
  });
});

describe('contactBelongsToClient', () => {
  it('accepts matching client and rejects mismatch', () => {
    const row = contact({
      id: '33333333-3333-4333-8333-333333333351',
      name: 'Dana',
      role: 'other',
      clientId: '22222222-2222-4222-8222-222222222222',
    });
    expect(contactBelongsToClient(row, '22222222-2222-4222-8222-222222222222')).toBe(true);
    expect(contactBelongsToClient(row, '22222222-2222-4222-8222-222222222299')).toBe(false);
  });
});

describe('createProjectSchema primaryContactId', () => {
  it('requires clientId when primaryContactId is set', () => {
    const parsed = createProjectSchema.safeParse({
      name: 'Tower',
      primaryContactId: '33333333-3333-4333-8333-333333333361',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts primaryContactId with matching clientId shape', () => {
    const parsed = createProjectSchema.safeParse({
      name: 'Tower',
      clientId: '22222222-2222-4222-8222-222222222222',
      primaryContactId: '33333333-3333-4333-8333-333333333361',
    });
    expect(parsed.success).toBe(true);
  });
});
