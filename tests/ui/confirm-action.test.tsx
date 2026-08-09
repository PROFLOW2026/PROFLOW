import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { renderWithIntl } from './test-utils';

describe('ConfirmAction', () => {
  it('requires confirmation before running the action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });

    renderWithIntl(
      <ConfirmAction
        title="ביטול תשלום"
        description={<p>לבטל את התשלום?</p>}
        confirmLabel="אישור ביטול"
        successMessage="התשלום בוטל."
        onConfirm={onConfirm}
        trigger={<Button type="button">ביטול תשלום</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'ביטול תשלום' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'אישור ביטול' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('surfaces a success alert when the action completes', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ConfirmAction
        title="ביטול תשלום"
        description={<p>לבטל את התשלום?</p>}
        confirmLabel="אישור ביטול"
        successMessage="התשלום בוטל."
        onConfirm={async () => ({ ok: true })}
        trigger={<Button type="button">ביטול תשלום</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'ביטול תשלום' }));
    await user.click(screen.getByRole('button', { name: 'אישור ביטול' }));

    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent('התשלום בוטל.');
  });

  it('surfaces a failure alert when the action returns an error', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ConfirmAction
        title="ביטול תשלום"
        description={<p>לבטל את התשלום?</p>}
        confirmLabel="אישור ביטול"
        successMessage="התשלום בוטל."
        onConfirm={async () => ({ error: 'אין הרשאה לבצע פעולה זו.' })}
        trigger={<Button type="button">ביטול תשלום</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'ביטול תשלום' }));
    await user.click(screen.getByRole('button', { name: 'אישור ביטול' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('אין הרשאה לבצע פעולה זו.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('surfaces a failure alert when the action throws', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ConfirmAction
        title="ביטול תשלום"
        description={<p>לבטל את התשלום?</p>}
        confirmLabel="אישור ביטול"
        successMessage="התשלום בוטל."
        onConfirm={async () => {
          throw new Error('network');
        }}
        trigger={<Button type="button">ביטול תשלום</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'ביטול תשלום' }));
    await user.click(screen.getByRole('button', { name: 'אישור ביטול' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('הפעולה לא הושלמה. אפשר לנסות שוב.');
  });
});
