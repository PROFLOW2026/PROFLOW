/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignFamilyChrome } from '@/shared/theme/design/templates/design-family-chrome';

afterEach(() => {
  cleanup();
});

const SHEKEL_AMOUNT = /₪\s*[\d][\d,.]*(?:\s*₪)?|[\d][\d,.]*\s*₪|ש["״]ח\s*[\d][\d,.]*/;

describe('DesignFamilyChrome', () => {
  it('design v9 + family list shows landmark v9-family and טבלה מלאה, without a secondary-detail button', () => {
    render(<DesignFamilyChrome family="list" design="v9" />);

    const landmark = document.querySelector('[data-pf-design-landmark="v9-family"]');
    expect(landmark).not.toBeNull();
    expect(landmark).toBeVisible();
    expect(screen.getByText(/טבלה מלאה/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /פירוט משני/ })).not.toBeInTheDocument();
  });

  it('design v10 + family list shows a keyboard-accessible פירוט משני button that reveals v10-secondary', async () => {
    const user = userEvent.setup();
    render(<DesignFamilyChrome family="list" design="v10" />);

    const button = screen.getByRole('button', { name: 'פירוט משני' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    const secondary = screen.getByText(/הפירוט המשני פתוח/);
    expect(secondary).toBeVisible();
    expect(secondary).toHaveAttribute('data-pf-design-landmark', 'v10-secondary');
  });

  it('family chrome never prints a contract-margin or VAT claim', () => {
    for (const family of ['finance', 'home-dual', 'project-home', 'surface-home', 'list'] as const) {
      for (const design of ['v9', 'v10'] as const) {
        const { container, unmount } = render(<DesignFamilyChrome family={family} design={design} />);
        expect(container.textContent ?? '').not.toMatch(/מרווח חוזי|מע״מ וברוטו/);
        expect(container.textContent ?? '').not.toMatch(SHEKEL_AMOUNT);
        unmount();
      }
    }
  });

  it('design v9 + family project-home shows פרויקט', () => {
    render(<DesignFamilyChrome family="project-home" design="v9" />);
    expect(screen.getByText('פרויקט')).toBeVisible();
  });

  it('family engine and family print render nothing', () => {
    for (const family of ['engine', 'print'] as const) {
      for (const design of ['v9', 'v10'] as const) {
        const { container, unmount } = render(
          <DesignFamilyChrome family={family} design={design} />,
        );
        expect(container).toBeEmptyDOMElement();
        unmount();
      }
    }
  });
});
