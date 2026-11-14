import defaultCatalogJson from './catalog.default.json';
import { catalogTypeSchema, type CatalogType } from './contracts';

export type CatalogOverrides = {
  readonly customTypes?: readonly CatalogType[];
  readonly archivedKeys?: readonly string[];
};

const defaultParsed = catalogTypeSchema.array().parse(defaultCatalogJson);

export function loadDefaultCatalog(): CatalogType[] {
  return defaultParsed.map((t) => ({ ...t }));
}

export function validateCatalogTypes(types: unknown): CatalogType[] {
  return catalogTypeSchema.array().parse(types);
}

export function assertCatalogIntegrity(types: CatalogType[]): void {
  const keys = new Set<string>();
  const colors = new Set<string>();
  for (const t of types) {
    if (keys.has(t.key)) throw new Error(`duplicate catalog key: ${t.key}`);
    keys.add(t.key);
    if (!/^#[0-9a-fA-F]{6}$/.test(t.colorHex)) throw new Error(`invalid color for ${t.key}`);
    if (!t.nameHe.trim()) throw new Error(`empty nameHe for ${t.key}`);
    colors.add(t.colorHex.toLowerCase());
  }
}

/**
 * Built-in catalog merged with org custom types; `archivedKeys` hide built-ins without deleting customs.
 */
export function mergeCatalog(overrides: CatalogOverrides = {}): CatalogType[] {
  const archived = new Set(overrides.archivedKeys ?? []);
  const byKey = new Map<string, CatalogType>();

  for (const t of loadDefaultCatalog()) {
    if (!archived.has(t.key)) byKey.set(t.key, { ...t });
  }
  for (const custom of overrides.customTypes ?? []) {
    const parsed = catalogTypeSchema.parse({ ...custom, builtIn: false });
    byKey.set(parsed.key, parsed);
  }

  const merged = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  assertCatalogIntegrity(merged);
  return merged;
}

export function catalogByKey(catalog: readonly CatalogType[]): Map<string, CatalogType> {
  return new Map(catalog.map((t) => [t.key, t]));
}