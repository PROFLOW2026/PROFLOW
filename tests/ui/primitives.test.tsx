import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import { money } from '@/shared/money/money';
import { renderWithIntl } from './test-utils';

describe('Button', () => {
  it('shows a busy state without losing its label', () => {
    renderWithIntl(<Button loading>שמירה</Button>);
    const button = screen.getByRole('button', { name: 'שמירה' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders as its child element without injecting extra children', () => {
    // Radix Slot accepts exactly one child, so a stray spinner slot would throw.
    renderWithIntl(
      <Button asChild>
        <a href="/projects">פרויקטים</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'פרויקטים' })).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('conveys status as text, not colour alone', () => {
    renderWithIntl(<StatusBadge shape="pending" label="ממתין לאישור" />);
    expect(screen.getByText('ממתין לאישור')).toBeVisible();
  });
});

describe('Field', () => {
  it('wires the label, description and error to the control for screen readers', () => {
    renderWithIntl(
      <Field label="סכום" required description="כולל מע״מ" error="הזינו סכום תקין">
        {(control) => <Input {...control} name="amount" />}
      </Field>,
    );

    const input = screen.getByLabelText(/סכום/);
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ').filter(Boolean).length).toBe(2);
    expect(screen.getByText('הזינו סכום תקין')).toBeVisible();
    expect(screen.getByText('כולל מע״מ')).toBeVisible();
  });

  it('marks an optional field as optional rather than pretending it is required', () => {
    renderWithIntl(
      <Field label="תיאור" optionalLabel="אופציונלי">
        {(control) => <Input {...control} name="description" />}
      </Field>,
    );

    expect(screen.getByText('אופציונלי')).toBeVisible();
    expect(screen.getByLabelText('תיאור')).not.toHaveAttribute('aria-invalid');
  });
});

describe('MoneyText', () => {
  it('isolates the amount as a left-to-right run inside a Hebrew page', () => {
    const { container } = renderWithIntl(<MoneyText value={money('1500', 'ILS')} />);
    const element = container.firstElementChild!;
    expect(element).toHaveAttribute('dir', 'ltr');
    expect(element.className).toContain('pf-numeric');
  });

  it('signs a negative amount textually', () => {
    renderWithIntl(<MoneyText value={money('-1500', 'ILS')} />);
    expect(screen.getByText(/\u2212/)).toBeVisible();
  });
});

describe('EmptyState', () => {
  it('reads as an invitation, not as an error', () => {
    renderWithIntl(
      <EmptyState
        title="עדיין אין הוצאות"
        description="כשתרשמו הוצאה ראשונה היא תופיע כאן."
        action={<Button>רישום הוצאה</Button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'עדיין אין הוצאות' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Alert', () => {
  it('announces a danger alert assertively and a notice politely', () => {
    const { rerender } = renderWithIntl(<Alert tone="danger">שגיאה</Alert>);
    expect(screen.getByRole('alert')).toBeVisible();

    rerender(<Alert tone="info">הודעה</Alert>);
    expect(screen.getByRole('status')).toBeVisible();
  });
});
