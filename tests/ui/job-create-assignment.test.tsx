import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { JobCreateEmployeePicker } from '@/app/[locale]/(app)/jobs/new/job-create-employee-picker';
import { JobCreateForm } from '@/app/[locale]/(app)/jobs/new/job-create-form';
import commonHe from '@/locales/he-IL/common.json';
import heJobs from '@/locales/he-IL/jobs.json';
import heProjects from '@/locales/he-IL/projects.json';

vi.mock('@/app/[locale]/(app)/jobs/actions', () => ({
  createJobAction: async () => ({}),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderHe(ui: ReactElement) {
  return render(
    <div dir="rtl" lang="he">
      <NextIntlClientProvider
        locale="he-IL"
        messages={{ common: commonHe, jobs: heJobs, projects: heProjects }}
        timeZone="Asia/Jerusalem"
      >
        {ui}
      </NextIntlClientProvider>
    </div>,
  );
}

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';

describe('Job create employee assignment picker', () => {
  it('shows a real assignment picker and labels leftover notes as team notes', async () => {
    const user = userEvent.setup();
    renderHe(
      <JobCreateForm
        baseCurrency="ILS"
        currencySymbol="₪"
        clients={[]}
        defaultStartDate="2026-08-10"
        canAssignEmployees
        employees={[{ id: EMPLOYEE_ID, name: 'דנה כהן', jobTitle: 'טכנאית' }]}
      />,
    );

    expect(screen.getByText(heJobs.create.assignLabel)).toBeVisible();
    expect(screen.getByText(heJobs.create.assignHint)).toBeVisible();
    expect(screen.getByText(/דנה כהן/)).toBeVisible();
    expect(screen.queryByPlaceholderText('הערת צוות (אופציונלי)')).toBeNull();

    await user.click(screen.getByRole('button', { name: heJobs.create.moreDetails }));
    expect(screen.getByText(heJobs.create.notesLabel)).toBeVisible();
    expect(screen.getByText(heJobs.create.notesHint)).toBeVisible();
  });

  it('submits selected employeeIds and does not treat assignment as cost', async () => {
    const user = userEvent.setup();
    renderHe(
      <form>
        <JobCreateEmployeePicker
          employees={[{ id: EMPLOYEE_ID, name: 'דנה כהן', jobTitle: null }]}
        />
      </form>,
    );

    expect(screen.queryByDisplayValue(EMPLOYEE_ID)).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'דנה כהן' }));
    expect(screen.getByDisplayValue(EMPLOYEE_ID)).toHaveAttribute('name', 'employeeIds');
    expect(screen.getByText(heJobs.create.assignHint)).toBeVisible();
  });
});
