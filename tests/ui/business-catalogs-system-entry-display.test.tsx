import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CatalogEntryNameField,
  resolveCatalogEntryNameFieldModel,
} from '@/app/[locale]/(app)/settings/business-catalogs/_lib/catalog-entry-name-field';
import type { CatalogEntryView } from '@/app/[locale]/(app)/settings/business-catalogs/_lib/types';

const systemPrivateEntry: Pick<CatalogEntryView, 'kind' | 'key' | 'name' | 'isSystem'> = {
  kind: 'client_type',
  key: 'private',
  name: 'Private',
  isSystem: true,
};

const customEntry: Pick<CatalogEntryView, 'kind' | 'key' | 'name' | 'isSystem'> = {
  kind: 'client_type',
  key: 'acme_type',
  name: 'Acme Corp Type',
  isSystem: false,
};

describe('business catalog system entry display model', () => {
  it('keeps canonical DB name for submit while showing localized visible text', () => {
    expect(resolveCatalogEntryNameFieldModel(systemPrivateEntry, 'he-IL')).toEqual({
      mode: 'system',
      visibleName: 'פרטי',
      submitName: 'Private',
    });
    expect(resolveCatalogEntryNameFieldModel(systemPrivateEntry, 'ar')).toEqual({
      mode: 'system',
      visibleName: 'خاص',
      submitName: 'Private',
    });
    expect(resolveCatalogEntryNameFieldModel(systemPrivateEntry, 'ru')).toEqual({
      mode: 'system',
      visibleName: 'Частный',
      submitName: 'Private',
    });
    expect(resolveCatalogEntryNameFieldModel(systemPrivateEntry, 'en')).toEqual({
      mode: 'system',
      visibleName: 'Private',
      submitName: 'Private',
    });
  });

  it('preserves custom user entries as editable stored names', () => {
    expect(resolveCatalogEntryNameFieldModel(customEntry, 'he-IL')).toEqual({
      mode: 'custom',
      visibleName: 'Acme Corp Type',
      submitName: 'Acme Corp Type',
    });
  });
});

describe('CatalogEntryNameField rendering', () => {
  it('renders localized visible text for system entries, not the English DB name', () => {
    render(<CatalogEntryNameField entry={systemPrivateEntry} locale="he-IL" />);

    expect(screen.getByText('פרטי')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="hidden"][name="name"]')).toHaveValue('Private');
  });

  it('renders editable input for custom entries', () => {
    render(<CatalogEntryNameField entry={customEntry} locale="he-IL" />);

    expect(screen.getByDisplayValue('Acme Corp Type')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp Type', { selector: 'span' })).not.toBeInTheDocument();
  });
});
