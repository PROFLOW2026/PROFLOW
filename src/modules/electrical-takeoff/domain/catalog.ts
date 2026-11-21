import defaultCatalogJson from './catalog.default.json';
import {
  catalogTypeSchema,
  type CatalogType,
  type ElectricalCategory,
} from './contracts';

export type CatalogOverrides = {
  readonly customTypes?: readonly CatalogType[];
  readonly archivedKeys?: readonly string[];
};

export type OrgCatalogOverrideRow = {
  readonly key: string;
  readonly archived: boolean;
  readonly payload: unknown;
};

const defaultParsed = catalogTypeSchema.array().parse(defaultCatalogJson);
const defaultKeySet = new Set(defaultParsed.map((type) => type.key));

export function loadDefaultCatalog(): CatalogType[] {
  return defaultParsed.map((t) => ({ ...t }));
}

export function isDefaultCatalogKey(key: string): boolean {
  return defaultKeySet.has(key);
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
 * Must stay byte-for-byte aligned with `app.normalize_takeoff_catalog_name`
 * in `drizzle/migrations/0216_takeoff_catalog_types_library_write.sql`.
 * Whitespace class is explicit so Hebrew + Unicode names match PostgreSQL.
 */
export const CATALOG_NAME_WHITESPACE =
  /[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;

export function normalizeCatalogNameHe(name: string): string {
  return name.normalize('NFC').replace(CATALOG_NAME_WHITESPACE, ' ').trim();
}

export function allocateCustomTypeKey(category: ElectricalCategory, hexId?: string): string {
  const id = (hexId ?? crypto.randomUUID().replace(/-/g, '')).slice(0, 12).toLowerCase();
  return `custom.${category}.${id}`;
}

export function roleForCategory(category: ElectricalCategory): CatalogType['role'] {
  if (category === 'lighting' || category === 'emergency_lighting') return 'fixture';
  if (category === 'conduit_tray') return 'linear';
  if (category === 'panels_distribution') return 'equipment';
  return 'device';
}

export function colorForCategory(category: ElectricalCategory, catalog: readonly CatalogType[] = defaultParsed): string {
  const sibling = catalog.find((type) => type.category === category && !type.archived);
  return sibling?.colorHex ?? '#2563eb';
}

export function findActiveNameDuplicate(
  catalog: readonly CatalogType[],
  nameHe: string,
  exceptKey?: string,
): CatalogType | undefined {
  const normalized = normalizeCatalogNameHe(nameHe);
  if (!normalized) return undefined;
  return catalog.find(
    (type) =>
      !type.archived &&
      type.key !== exceptKey &&
      normalizeCatalogNameHe(type.nameHe) === normalized,
  );
}

export function buildCustomCatalogType(input: {
  category: ElectricalCategory;
  nameHe: string;
  catalog: readonly CatalogType[];
  key?: string;
}): CatalogType {
  const nameHe = normalizeCatalogNameHe(input.nameHe);
  return catalogTypeSchema.parse({
    key: input.key ?? allocateCustomTypeKey(input.category),
    category: input.category,
    role: roleForCategory(input.category),
    nameHe,
    unit: "יח'",
    keywordsHe: [],
    colorHex: colorForCategory(input.category, input.catalog),
    builtIn: false,
    archived: false,
  });
}

export function applyOrgDisplayName(type: CatalogType, nameHe: string): CatalogType {
  return catalogTypeSchema.parse({
    ...type,
    nameHe: normalizeCatalogNameHe(nameHe),
  });
}

/**
 * Built-in catalog merged with org custom types. Archived types stay in the map
 * for historical labels; pickers must filter them.
 */
export function mergeCatalog(overrides: CatalogOverrides = {}): CatalogType[] {
  const archived = new Set(overrides.archivedKeys ?? []);
  const byKey = new Map<string, CatalogType>();

  for (const t of loadDefaultCatalog()) {
    byKey.set(t.key, archived.has(t.key) ? { ...t, archived: true } : { ...t });
  }
  for (const custom of overrides.customTypes ?? []) {
    const parsed = catalogTypeSchema.parse({
      ...custom,
      builtIn: isDefaultCatalogKey(custom.key) ? custom.builtIn : false,
    });
    byKey.set(parsed.key, parsed);
  }

  const merged = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  assertCatalogIntegrity(merged);
  return merged;
}

export function mergeOrgCatalog(rows: readonly OrgCatalogOverrideRow[]): CatalogType[] {
  const customTypes: CatalogType[] = [];
  const archivedKeys: string[] = [];
  for (const row of rows) {
    const parsed = catalogTypeSchema.safeParse({
      ...(typeof row.payload === 'object' && row.payload ? row.payload : {}),
      key: row.key,
      archived: row.archived,
      builtIn: isDefaultCatalogKey(row.key),
    });
    if (!parsed.success) continue;
    customTypes.push({ ...parsed.data, archived: row.archived || parsed.data.archived });
    if (row.archived) archivedKeys.push(row.key);
  }
  return mergeCatalog({ customTypes, archivedKeys });
}

export function pickerCatalog(catalog: readonly CatalogType[], selectedKey?: string): CatalogType[] {
  return catalog.filter((type) => !type.archived || type.key === selectedKey);
}

/** Worker payload: active types only; custom types never carry legend keywords. */
export function catalogForWorker(catalog: readonly CatalogType[]): CatalogType[] {
  const defaults = catalogByKey(loadDefaultCatalog());
  return catalog
    .filter((type) => !type.archived)
    .map((type) => {
      const builtIn = defaults.get(type.key);
      if (builtIn) {
        return {
          ...builtIn,
          nameHe: type.nameHe,
          archived: false,
        };
      }
      return { ...type, keywordsHe: [], builtIn: false, archived: false };
    });
}

export function archivedCatalogKeys(catalog: readonly CatalogType[]): ReadonlySet<string> {
  return new Set(catalog.filter((type) => type.archived).map((type) => type.key));
}

export function catalogByKey(catalog: readonly CatalogType[]): Map<string, CatalogType> {
  return new Map(catalog.map((t) => [t.key, t]));
}
