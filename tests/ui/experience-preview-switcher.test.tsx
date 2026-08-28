import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import heNav from '@/locales/he-IL/nav.json';
import { ExperiencePreviewSwitcher } from '@/components/shell/experience-preview-switcher';
import { renderWithIntl } from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('ExperiencePreviewSwitcher nav presentation', () => {
  it('shows compact Hebrew label above the profile selector', () => {
    renderWithIntl(
      <ExperiencePreviewSwitcher selection="actual" active={false} labelKey="actual" />,
      { locale: 'he-IL', messages: { nav: heNav } },
    );

    expect(screen.getByText(heNav.experiencePreview.label)).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: heNav.experiencePreview.label }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: heNav.experiencePreview.actual }),
    ).toBeInTheDocument();
  });
});
