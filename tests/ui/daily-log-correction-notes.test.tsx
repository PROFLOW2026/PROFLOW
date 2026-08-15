import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyLogCorrectionNotes } from '@/modules/field-ops/ui/daily-log-correction-notes';

describe('DailyLogCorrectionNotes', () => {
  it('renders correction notes on the detail surface', () => {
    render(
      <DailyLogCorrectionNotes
        label="Correction notes"
        notes={'--- correction ---\n[2026-08-15T08:00:00.000Z]\nLate delivery recorded'}
      />,
    );

    expect(screen.getByTestId('daily-log-correction-notes')).toBeInTheDocument();
    expect(screen.getByText('Correction notes')).toBeInTheDocument();
    expect(screen.getByText(/Late delivery recorded/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-15T08:00:00.000Z/)).toBeInTheDocument();
  });

  it('renders nothing when there are no correction notes', () => {
    const { container } = render(<DailyLogCorrectionNotes label="Correction notes" notes={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
