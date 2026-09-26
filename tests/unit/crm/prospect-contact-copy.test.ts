import { describe, expect, it } from 'vitest';

import { selectProspectContactsToCopy } from '@/modules/crm/domain/prospect-contact-copy';

describe('selectProspectContactsToCopy', () => {
  it('copies name, email, and phone when the client has no matching contact', () => {
    const selected = selectProspectContactsToCopy(
      [{ name: ' Dana ', email: 'dana@example.com', phone: '050-111-2233' }],
      [],
    );
    expect(selected).toEqual([
      { name: 'Dana', email: 'dana@example.com', phone: '050-111-2233' },
    ]);
  });

  it('skips a contact that already exists with the same email or the same phone', () => {
    const prospects = [
      { name: 'Dana', email: 'Dana@Example.com', phone: '050-999-0000' },
      { name: 'Avi', email: 'avi@example.com', phone: '0501112233' },
      { name: 'Noa', email: 'noa@example.com', phone: '052-000-0000' },
    ];
    const existing = [
      { name: 'Existing email', email: 'dana@example.com', phone: null },
      { name: 'Existing phone', email: null, phone: '050-111-2233' },
    ];

    expect(selectProspectContactsToCopy(prospects, existing)).toEqual([
      { name: 'Noa', email: 'noa@example.com', phone: '052-000-0000' },
    ]);
  });

  it('does not treat a blank email or phone as a match', () => {
    const selected = selectProspectContactsToCopy(
      [
        { name: 'Dana', email: null, phone: '  ' },
        { name: 'Avi', email: '', phone: null },
      ],
      [{ name: 'Other', email: null, phone: null }],
    );
    expect(selected.map((contact) => contact.name)).toEqual(['Dana', 'Avi']);
  });

  it('does not copy a name-only contact that is already on the client', () => {
    const selected = selectProspectContactsToCopy(
      [{ name: 'Dana', email: null, phone: null }],
      [{ name: 'dana', email: null, phone: null }],
    );
    expect(selected).toEqual([]);
  });

  it('does not copy the same contact twice in one pass', () => {
    const selected = selectProspectContactsToCopy(
      [
        { name: 'Dana', email: 'dana@example.com', phone: null },
        { name: 'Dana again', email: 'dana@example.com', phone: '050-111' },
      ],
      [],
    );
    expect(selected).toEqual([{ name: 'Dana', email: 'dana@example.com', phone: null }]);
  });
});
