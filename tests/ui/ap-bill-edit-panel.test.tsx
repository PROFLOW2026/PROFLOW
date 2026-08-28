import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApBillRecognizedEditPanel } from '@/app/[locale]/(app)/procurement/ap/[billId]/ap-bill-edit-panel';
import heAp from '@/locales/he-IL/ap.json';

vi.mock('@/app/[locale]/(app)/procurement/ap/actions', () => ({
  editRecognizedApBillAction: vi.fn(),
}));

const baseProps = {
  billId: 'bill-1',
  vendorId: 'vendor-1',
  vendors: [{ id: 'vendor-1', name: 'ספק א' }],
  projectId: null,
  projects: [{ id: 'project-1', name: 'פרויקט א' }],
  billDate: '2026-08-15',
  currency: 'ILS',
  amountIncludesTax: false,
  notes: 'הערה',
  lines: [
    {
      id: 'line-1',
      description: 'שורה',
      quantity: '1',
      unitAmount: '100',
      lineTotal: '100',
      costCategoryId: 'cat-1',
    },
  ],
  costCategories: [
    { id: 'cat-1', key: 'materials', name: 'חומרים', family: 'direct_project' },
  ],
};

function renderPanel(canEdit: boolean) {
  return render(
    <NextIntlClientProvider locale="he-IL" messages={{ ap: heAp }}>
      <ApBillRecognizedEditPanel {...baseProps} canEdit={canEdit} />
    </NextIntlClientProvider>,
  );
}

describe('ApBillRecognizedEditPanel', () => {
  it('shows עריכה when open month allows edit', async () => {
    renderPanel(true);
    expect(screen.getByRole('button', { name: heAp.recognizedEdit.action })).toBeInTheDocument();
  });

  it('hides edit UI when month is closed', () => {
    renderPanel(false);
    expect(screen.queryByRole('button', { name: heAp.recognizedEdit.action })).not.toBeInTheDocument();
  });

  it('opens full edit form with שמירה and ביטול', async () => {
    const user = userEvent.setup();
    renderPanel(true);
    await user.click(screen.getByRole('button', { name: heAp.recognizedEdit.action }));
    expect(screen.getByRole('button', { name: heAp.recognizedEdit.save })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: heAp.recognizedEdit.cancel })).toBeInTheDocument();
    expect(screen.getByText(heAp.recognizedEdit.title)).toBeInTheDocument();
  });
});
