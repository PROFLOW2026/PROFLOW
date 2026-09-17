import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { ACCESS_CREDENTIAL_VALUE_CLASS, AccessInfoField } from '@/modules/employee-app/ui/access-info-field';

describe('AccessInfoField', () => {
  it('keeps value and copy adjacent (no full-width spread)', () => {
    const { container } = render(
      <AccessInfoField
        label="שם משתמש"
        value="2485"
        valueDir="ltr"
        valueClassName={ACCESS_CREDENTIAL_VALUE_CLASS}
        actions={
          <Button type="button" variant="ghost" size="sm">
            העתק
          </Button>
        }
      />,
    );

    const valueRow = container.querySelector('.flex.items-center.justify-start');
    expect(valueRow).toBeTruthy();
    expect(valueRow?.className).not.toMatch(/justify-between/);

    const value = screen.getByText('2485');
    expect(value.className).toMatch(/whitespace-nowrap/);
    expect(value.className).toMatch(/shrink-0/);
    expect(value.className).not.toMatch(/truncate/);
    expect(value.className).not.toMatch(/line-clamp/);

    const copy = screen.getByRole('button', { name: 'העתק' });
    expect(valueRow?.contains(value)).toBe(true);
    expect(valueRow?.contains(copy)).toBe(true);
  });

  it('shows full 6-digit PIN without ellipsis classes', () => {
    render(
      <AccessInfoField
        label="PIN זמני"
        value="651847"
        valueDir="ltr"
        valueClassName={ACCESS_CREDENTIAL_VALUE_CLASS}
        actions={
          <Button type="button" variant="ghost" size="sm">
            העתק
          </Button>
        }
      />,
    );

    const pin = screen.getByText('651847');
    expect(pin.textContent).toBe('651847');
    expect(pin.className).toMatch(/tabular-nums/);
    expect(pin.className).toMatch(/overflow-visible/);
  });
});
