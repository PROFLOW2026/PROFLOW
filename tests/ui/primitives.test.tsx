import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
    expect(button).toHaveAttribute('data-loading', '');
  });

  it('loading prevents double submit while the first action is in flight', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    function LoadingSubmitForm() {
      const [loading, setLoading] = useState(false);
      return (
        <Button
          type="button"
          loading={loading}
          onClick={() => {
            onSubmit();
            setLoading(true);
          }}
        >
          שמירה
        </Button>
      );
    }

    renderWithIntl(<LoadingSubmitForm />);
    const button = screen.getByRole('button', { name: 'שמירה' });

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-loading', '');
  });

  it('keeps pressed (active) feedback classes on primary and secondary variants', () => {
    const { rerender } = renderWithIntl(<Button variant="primary">שמירה</Button>);
    expect(screen.getByRole('button')).toHaveClass('active:bg-[var(--pf-action-primary-active)]');

    rerender(<Button variant="secondary">ביטול</Button>);
    expect(screen.getByRole('button')).toHaveClass('active:bg-[var(--pf-action-secondary-active)]');
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
    const element = container.querySelector('.pf-numeric');
    expect(element).toHaveAttribute('dir', 'ltr');
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
