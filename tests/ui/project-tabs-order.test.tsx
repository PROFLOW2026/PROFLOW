import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_TAB_PRIORITY } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';
import { ProjectTabsShell } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-shell';
import enCommon from '@/locales/en/common.json';
import enProjects from '@/locales/en/projects.json';
import heCommon from '@/locales/he-IL/common.json';
import heProjects from '@/locales/he-IL/projects.json';

const navState = vi.hoisted(() => ({
  pathname: '/projects/proj-1',
  replace: vi.fn(),
  dir: 'rtl' as 'rtl' | 'ltr',
}));

vi.mock('@/shared/i18n/navigation', () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ replace: navState.replace }),
}));

vi.mock('@/shared/i18n/direction', () => ({
  useLocaleDir: () => navState.dir,
}));

function renderTabs(locale: 'he-IL' | 'en', ui: ReactElement) {
  const messages =
    locale === 'he-IL'
      ? { common: heCommon, projects: heProjects }
      : { common: enCommon, projects: enProjects };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jerusalem">
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

describe('ProjectTabsShell encounter order', () => {
  beforeEach(() => {
    navState.pathname = '/projects/proj-1';
    navState.replace.mockReset();
  });

  it('keeps business-priority DOM order under Hebrew RTL (no array reverse)', () => {
    navState.dir = 'rtl';
    renderTabs(
      'he-IL',
      <ProjectTabsShell tabs={PROJECT_TAB_PRIORITY} activeTab="overview">
        <div>body</div>
      </ProjectTabsShell>,
    );

    const root = screen.getByRole('tablist').parentElement;
    expect(root).toHaveAttribute('dir', 'rtl');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim());
    expect(labels).toEqual([
      'סקירה',
      'כספים',
      'הוצאות',
      'שינויים ותוספות',
      'חיובים וגבייה',
      'עובדים ושעות',
      'מסמכים',
      'תחומי עבודה',
      'פרטים',
    ]);
  });

  it('keeps the same data order under English LTR', () => {
    navState.dir = 'ltr';
    renderTabs(
      'en',
      <ProjectTabsShell tabs={PROJECT_TAB_PRIORITY} activeTab="overview">
        <div>body</div>
      </ProjectTabsShell>,
    );

    const root = screen.getByRole('tablist').parentElement;
    expect(root).toHaveAttribute('dir', 'ltr');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim());
    expect(labels[0]).toMatch(/overview/i);
    expect(labels[1]).toMatch(/financial/i);
    expect(labels[labels.length - 1]).toMatch(/detail/i);
    expect(labels).toHaveLength(PROJECT_TAB_PRIORITY.length);
  });
});
