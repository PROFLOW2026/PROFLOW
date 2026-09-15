import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorageLoadingOverlay } from '@/modules/external-storage/ui/storage-loading-overlay';

describe('StorageLoadingOverlay', () => {
  it('renders as absolute overlay without occupying document flow', () => {
    const { container } = render(
      <div className="relative h-40">
        <p>Existing content</p>
        <StorageLoadingOverlay label="טוען…" />
      </div>,
    );

    expect(screen.getByText('Existing content')).toBeInTheDocument();
    const overlay = container.querySelector('[aria-busy="true"]');
    expect(overlay).toHaveClass('absolute', 'inset-0');
    expect(overlay).toHaveClass('pointer-events-none');
  });

  it('blocks pointer events when preparing share', () => {
    const { container } = render(
      <div className="relative h-40">
        <StorageLoadingOverlay label="מתכונן לשיתוף…" blocking />
      </div>,
    );

    const overlay = container.querySelector('[aria-busy="true"]');
    expect(overlay).toHaveClass('pointer-events-auto');
  });
});
