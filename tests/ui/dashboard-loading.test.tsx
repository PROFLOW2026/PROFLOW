import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardSkeleton } from '@/app/[locale]/(app)/(home)/dashboard-skeleton';
import { TabPanelSkeleton } from '@/app/[locale]/(app)/projects/[projectId]/tab-panel-skeleton';

describe('dashboard / app loading fallbacks', () => {
  it('DashboardSkeleton exposes aria-busy for assistive tech', () => {
    const { container } = render(<DashboardSkeleton label="Loading" />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy).toHaveAttribute('role', 'status');
    expect(busy!.textContent).toContain('Loading');
    expect(busy!.querySelectorAll('div').length).toBeGreaterThan(3);
  });

  it('DashboardSkeleton can omit the title bar for streamed page headers', () => {
    const { container } = render(<DashboardSkeleton showTitle={false} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('TabPanelSkeleton (app loading boundary) exposes aria-busy', () => {
    const { container } = render(<TabPanelSkeleton label="Loading" />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
