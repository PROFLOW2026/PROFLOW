import { readFile } from 'node:fs/promises';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { BoqMeasureClient } from '@/modules/boq/ui/boq-measure-client';
import enBoq from '@/locales/en/boq.json';
import enCommon from '@/locales/en/common.json';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/modules/boq/ui/actions', () => ({
  createProgressBatchAction: vi.fn(async () => ({})),
}));

const noopAction = vi.fn(async () => ({}));

function renderMeasure(ui: ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ boq: enBoq, common: enCommon }}
      timeZone="Asia/Jerusalem"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const items = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    itemCode: '03.01',
    description: 'Concrete slab',
    unit: 'm2',
    chapterLabel: 'Concrete',
    currentQuantity: '100',
    performedQuantity: '30',
    remainingQuantity: '70',
    pendingMeasuredQuantity: '0',
  },
];

describe('BOQ field measure client', () => {
  it('shows code, description, unit and quantities without prices or commercial totals', () => {
    renderMeasure(
      <BoqMeasureClient
        projectId="p1"
        boqId="b1"
        items={items}
        defaultPeriodLabel="2026-08-14"
        canSubmit
        submitAction={noopAction}
      />,
    );

    expect(screen.getAllByText(/03\.01/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Concrete slab').length).toBeGreaterThan(0);
    expect(screen.getByText(/Current qty/)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByLabelText(/Measured qty this period/)).toBeInTheDocument();
    expect(screen.queryByText(/unit price/i)).toBeNull();
    expect(screen.queryByText(/profit/i)).toBeNull();
    expect(screen.queryByText(/subcontractor/i)).toBeNull();
    expect(screen.queryByLabelText(/unit price/i)).toBeNull();
  });

  it('uses large tap targets for item cards and submit', async () => {
    const user = userEvent.setup();
    renderMeasure(
      <BoqMeasureClient
        projectId="p1"
        boqId="b1"
        items={items}
        defaultPeriodLabel="2026-08-14"
        canSubmit
        submitAction={noopAction}
      />,
    );

    const card = screen.getByRole('button', { name: /Concrete slab/ });
    expect(card.className).toMatch(/min-h-14/);
    const submit = screen.getByRole('button', { name: /Submit measurement/ });
    expect(submit.className).toMatch(/min-h-12/);
    await user.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not import money rendering in the field client', async () => {
    const source = await readFile('src/modules/boq/ui/boq-measure-client.tsx', 'utf8');
    expect(source).not.toMatch(/MoneyText/);
    expect(source).not.toMatch(/unitPrice|periodAmount|unitRate/);
    expect(source).toMatch(/createProgressBatchAction/);
  });
});
