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
  it('shows ללא סיווג next to הוסף אביזר חדש without using the type select', () => {
    const onExcludeFromBoq = vi.fn();
    render(
      wrap(
        <TakeoffTypePicker
          catalog={loadDefaultCatalog()}
          value=""
          onChange={vi.fn()}
          testId="takeoff-edit-type"
          canManageCatalog
          mutations={{ create: vi.fn(), update: vi.fn(), archive: vi.fn() }}
          onExcludeFromBoq={onExcludeFromBoq}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('takeoff-edit-type-exclude'));
    expect(onExcludeFromBoq).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('takeoff-edit-type-add')).toHaveTextContent(heTakeoff.catalog.addAccessory);
    expect(screen.getByTestId('takeoff-edit-type-exclude')).toHaveTextContent(heTakeoff.catalog.excludeFromBoq);
    expect(screen.getByTestId('takeoff-edit-type')).toHaveTextContent(heTakeoff.detection.unclassified);
  });

  it('adds לחצן דירה ייעודי under מפסקים and selects it immediately', async () => {
    const created = {
      key: 'custom.control.stairbtn01',
      category: 'control' as const,
      role: 'device' as const,
      nameHe: 'לחצן דירה ייעודי',
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
      target: { value: 'לחצן דירה ייעודי' },
    });
    fireEvent.click(screen.getByTestId('takeoff-guide-type-catalog-save'));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ category: 'control', nameHe: 'לחצן דירה ייעודי' }));
    expect(onChange).toHaveBeenCalledWith(created.key);
    expect(onCatalogSaved).toHaveBeenCalledWith(created);
  });

  it('selects an existing built-in instead of creating a duplicate name', async () => {
    const create = vi.fn();
    const onChange = vi.fn();
    render(
      wrap(
        <TakeoffTypePicker
          catalog={loadDefaultCatalog()}
          value=""
          onChange={onChange}
          testId="takeoff-guide-type"
          canManageCatalog
          mutations={{ create, update: vi.fn(), archive: vi.fn() }}
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: heTakeoff.catalogCategory.control }));
    fireEvent.click(screen.getByTestId('takeoff-guide-type-add'));
    fireEvent.change(screen.getByTestId('takeoff-guide-type-catalog-name'), {
      target: { value: 'מפסק תריס' },
    });
    fireEvent.click(screen.getByTestId('takeoff-guide-type-catalog-save'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('control.shutter'));
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByText(/Minified React error/i)).toBeNull();
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
