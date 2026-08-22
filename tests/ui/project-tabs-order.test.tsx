import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_TAB_PRIORITY } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';
import { ProjectTabsEnhancer } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-enhancer';
import { ProjectTabsList } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-list';
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
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/i18n/direction', () => ({
  useLocaleDir: () => navState.dir,
}));

function tabLabels(locale: 'he-IL' | 'en') {
  const tabs =
    locale === 'he-IL' ? heProjects.workspace.tabs : enProjects.workspace.tabs;
  return tabs;
}

function Shell({
  locale,
  activeTab = 'overview',
  children,
}: {
  locale: 'he-IL' | 'en';
  activeTab?: 'overview';
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full" dir={navState.dir}>
      <ProjectTabsList
        tabs={PROJECT_TAB_PRIORITY}
        activeTab={activeTab}
        labels={tabLabels(locale)}
        projectHref="/projects/proj-1"
        dir={navState.dir}
      />
      <ProjectTabsEnhancer
        tabs={PROJECT_TAB_PRIORITY}
        serverActiveTab={activeTab}
        activeTab={activeTab}
      >
        {children}
      </ProjectTabsEnhancer>
    </div>
  );
}

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
      <Shell locale="he-IL">
        <div>body</div>
      </Shell>,
    );

    const root = screen.getByRole('tablist').parentElement;
    expect(root).toHaveAttribute('dir', 'rtl');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim());
    expect(labels).toEqual([
      'סקירה',
      'כספים',
      'תקציב',
      'כתב כמויות',
      'שינויים ותוספות',
      'חיובים וגבייה',
      'תוכנית חיובים',
      'הוצאות',
      'חומרים וציוד',
      'צוות',
      'שעות',
      'לוח זמנים',
      'תחומי עבודה',
      'מסמכים',
      'סגירה',
      'אחריות',
      'פרטים',
    ]);
  });

  it('keeps the same data order under English LTR', () => {
    navState.dir = 'ltr';
    renderTabs(
      'en',
      <Shell locale="en">
        <div>body</div>
      </Shell>,
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
