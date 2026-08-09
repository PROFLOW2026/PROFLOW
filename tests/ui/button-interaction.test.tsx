import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button interaction states', () => {
  it('exposes pressed-capable active styles without relying on hover', () => {
    render(<Button type="button">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toMatch(/active:/);
  });

  it('loading state disables the control and sets aria-busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button type="button" loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
