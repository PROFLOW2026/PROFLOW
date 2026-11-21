import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import { loadDefaultCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { TakeoffTypePicker } from '@/modules/electrical-takeoff/ui/takeoff-type-picker';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

describe('TakeoffTypePicker org catalog', () => {
  it('adds לחצן חדר מדרגות under מפסקים and selects it immediately', async () => {
    const created = {
      key: 'custom.control.stairbtn01',
      category: 'control' as const,
      role: 'device' as const,
      nameHe: 'לחצן חדר מדרגות',
      unit: "יח'",
      keywordsHe: [] as string[],
      colorHex: '#7f7f7f',
      builtIn: false,
      archived: false,
    };
    const create = vi.fn(async () => created);
    const onChange = vi.fn();
    const onCatalogSaved = vi.fn();
    render(
      wrap(
        <TakeoffTypePicker
          catalog={loadDefaultCatalog()}
          value=""
          onChange={onChange}
          testId="takeoff-guide-type"
          canManageCatalog
          mutations={{ create, update: vi.fn(), archive: vi.fn() }}
          onCatalogSaved={onCatalogSaved}
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: heTakeoff.catalogCategory.control }));
    fireEvent.click(screen.getByTestId('takeoff-guide-type-add'));
    fireEvent.change(screen.getByTestId('takeoff-guide-type-catalog-name'), {
      target: { value: 'לחצן חדר מדרגות' },
    });
    fireEvent.click(screen.getByTestId('takeoff-guide-type-catalog-save'));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ category: 'control', nameHe: 'לחצן חדר מדרגות' }));
    expect(onChange).toHaveBeenCalledWith(created.key);
    expect(onCatalogSaved).toHaveBeenCalledWith(created);
  });

  it('hides add actions without library manage permission', () => {
    render(
      wrap(
        <TakeoffTypePicker
          catalog={loadDefaultCatalog()}
          value=""
          onChange={() => {}}
          testId="takeoff-guide-type"
          canManageCatalog={false}
        />,
      ),
    );
    expect(screen.queryByTestId('takeoff-guide-type-add')).toBeNull();
  });
});
