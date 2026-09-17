import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceReportMonthForm } from '@/app/[locale]/(app)/workforce/attendance/reports/attendance-report-month-form';
import workforce from '@/locales/he-IL/workforce.json';
import { renderWithIntl } from './test-utils';

const push = vi.fn();

vi.mock('@/shared/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('AttendanceReportMonthForm', () => {
  it('shows compact month display and navigates with canonical YYYY-MM id', () => {
    push.mockReset();
    renderWithIntl(<AttendanceReportMonthForm defaultMonth="2026-09" />, {
      locale: 'he-IL',
      messages: { workforce },
    });

    expect(screen.getByRole('combobox')).toHaveTextContent('9');
    expect(screen.getByRole('spinbutton')).toHaveValue(2026);
    expect(screen.getByLabelText('חודש נבחר 9/26')).toHaveTextContent('9/26');

    fireEvent.click(screen.getByRole('button', { name: 'הצג דוח' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/preview?kind=monthly_workforce_report&id=2026-09',
    );
  });

  it('allows historical years without an artificial range limit', () => {
    push.mockReset();
    renderWithIntl(<AttendanceReportMonthForm defaultMonth="2026-09" />, {
      locale: 'he-IL',
      messages: { workforce },
    });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2024' } });
    expect(screen.getByLabelText('חודש נבחר 9/24')).toHaveTextContent('9/24');

    fireEvent.click(screen.getByRole('button', { name: 'הצג דוח' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/preview?kind=monthly_workforce_report&id=2024-09',
    );
  });

  it('allows future years', () => {
    push.mockReset();
    renderWithIntl(<AttendanceReportMonthForm defaultMonth="2026-01" />, {
      locale: 'he-IL',
      messages: { workforce },
    });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2031' } });
    expect(screen.getByLabelText('חודש נבחר 1/31')).toHaveTextContent('1/31');

    fireEvent.click(screen.getByRole('button', { name: 'הצג דוח' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/preview?kind=monthly_workforce_report&id=2031-01',
    );
  });
});
