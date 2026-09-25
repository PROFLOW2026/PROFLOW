import { Input } from '@/components/ui/input';
import { localizeCatalogEntryName } from '@/modules/business-catalog/domain/catalog-entry-localization';
import type { CatalogEntryView } from './types';

export type CatalogEntryNameFieldModel =
  | {
      readonly mode: 'system';
      readonly visibleName: string;
      readonly submitName: string;
    }
  | {
      readonly mode: 'custom';
      readonly visibleName: string;
      readonly submitName: string;
    };

export function resolveCatalogEntryNameFieldModel(
  entry: Pick<CatalogEntryView, 'kind' | 'key' | 'name' | 'isSystem'>,
  locale: string,
): CatalogEntryNameFieldModel {
  const localizedName = localizeCatalogEntryName(
    entry.kind,
    entry.key,
    entry.name,
    locale,
    entry.isSystem,
  );

  if (entry.isSystem) {
    return {
      mode: 'system',
      visibleName: localizedName,
      submitName: entry.name,
    };
  }

  return {
    mode: 'custom',
    visibleName: entry.name,
    submitName: entry.name,
  };
}

export function CatalogEntryNameField({
  entry,
  locale,
}: {
  entry: Pick<CatalogEntryView, 'kind' | 'key' | 'name' | 'isSystem'>;
  locale: string;
}) {
  const model = resolveCatalogEntryNameFieldModel(entry, locale);

  if (model.mode === 'system') {
    return (
      <>
        <input type="hidden" name="name" value={model.submitName} />
        <span className="min-w-0 flex-1 text-sm font-medium">{model.visibleName}</span>
      </>
    );
  }

  return (
    <Input
      name="name"
      defaultValue={model.visibleName}
      className="min-w-0 w-full max-w-xs flex-1"
      aria-label={model.visibleName}
    />
  );
}
