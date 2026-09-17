import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttendanceManualEntryForm } from '@/modules/workforce/ui/attendance-manual-entry-form';
import workforce from '@/locales/he-IL/workforce.json';
import { renderWithIntl } from './test-utils';

async function noopManualAction() {
  return {};
}

describe('AttendanceManualEntryForm default clock times', () => {
  const employees = [{ id: 'emp-1', name: 'Test Employee' }];

  it('defaults to 09:00–17:00 when org times are not passed', () => {
    renderWithIntl(
      <AttendanceManualEntryForm
        action={noopManualAction}
        employees={employees}
        defaultDate="2026-09-17"
      />,
      { locale: 'he-IL', messages: { workforce } },
    );

    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('17:00')).toBeInTheDocument();
  });

  it('prefills org defaults and remains editable', () => {
    renderWithIntl(
      <AttendanceManualEntryForm
        action={noopManualAction}
        employees={employees}
        defaultDate="2026-09-17"
        defaultClockInTime="07:00"
        defaultClockOutTime="15:00"
      />,
      { locale: 'he-IL', messages: { workforce } },
    );

    const clockIn = screen.getByDisplayValue('07:00');
    const clockOut = screen.getByDisplayValue('15:00');
    expect(clockIn).toBeInTheDocument();
    expect(clockOut).toBeInTheDocument();

    fireEvent.change(clockIn, { target: { value: '08:30' } });
    fireEvent.change(clockOut, { target: { value: '16:30' } });

    expect(screen.getByDisplayValue('08:30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('16:30')).toBeInTheDocument();
  });
});
