import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enExternalStorage from '@/locales/en/externalStorage.json';
import { CadDwgSpaceSelect } from '@/modules/external-storage/ui/cad/pf-cad/cad-dwg-space-select';

function renderSelect() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ externalStorage: enExternalStorage }}>
      <div className="bg-[#0a0e14] p-2">
        <CadDwgSpaceSelect
          spaces={['*Model_Space', '*Paper_Space0', '*Paper_Space1']}
          value="*Model_Space"
          onValueChange={vi.fn()}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

describe('CadDwgSpaceSelect', () => {
  it('shows high-contrast trigger label on dark viewer chrome', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox', { name: 'Model or layout' });
    expect(trigger).toHaveTextContent('Model');
    expect(trigger.className).toMatch(/text-\[#0b1220\]/);
    expect(trigger.className).toMatch(/bg-\[#eef2f8\]/);
  });

  it('renders nothing when only one space exists', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ externalStorage: enExternalStorage }}>
        <CadDwgSpaceSelect spaces={['*Model_Space']} value="*Model_Space" onValueChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('[role=combobox]')).toBeNull();
  });
});
