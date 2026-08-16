/**
 * Structured CSV/Excel import types (doc 37). Framework-free.
 */

export const IMPORT_KINDS = [
  'clients',
  'contacts',
  'vendors',
  'employees',
  'projects',
  'opening_values',
  'cost_categories',
  'expenses',
  'inventory',
  'boq_items',
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number];

/**
 * Kinds confirmable via canonical create* APIs (or additive catalog inserts).
 * Expenses create draft rows only - never finalize/bypass money rules.
 * Opening values use the same contract opening path as project create/edit.
 * Inventory uses createInventoryItem (qty receive to default location - not Actual).
 */
export const ENABLED_IMPORT_KINDS = [
  'clients',
  'contacts',
  'vendors',
  'employees',
  'projects',
  'opening_values',
  'cost_categories',
  'expenses',
  'inventory',
  'boq_items',
] as const satisfies readonly ImportKind[];

export type EnabledImportKind = (typeof ENABLED_IMPORT_KINDS)[number];

export function isImportKind(value: string): value is ImportKind {
  return (IMPORT_KINDS as readonly string[]).includes(value);
}

export function isEnabledImportKind(value: string): value is EnabledImportKind {
  return (ENABLED_IMPORT_KINDS as readonly string[]).includes(value);
}

export type ImportIssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  readonly severity: ImportIssueSeverity;
  readonly field?: string;
  readonly message: string;
}

export interface ImportFieldDef {
  readonly key: string;
  readonly required: boolean;
  /** Header aliases matched case-insensitively (spaces/underscores ignored). */
  readonly aliases: readonly string[];
  /**
   * Employer cost / compensation field. Preview errors unless the actor has
   * `workforce.cost.manage`; confirm must not apply the value without that key.
   */
  readonly requiresCostManage?: boolean;
}

export interface ParsedCsv {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Column index per canonical field key; -1 / missing = unmapped. */
export type ColumnMapping = Readonly<Record<string, number>>;

export interface MappedImportRow {
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, string>>;
  readonly issues: readonly ImportIssue[];
}

export interface ImportPreview {
  readonly kind: ImportKind;
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly rows: readonly MappedImportRow[];
  readonly validCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly enabled: boolean;
}

export interface ImportRowResult {
  readonly rowNumber: number;
  readonly ok: boolean;
  readonly entityId?: string;
  readonly error?: string;
}

export interface ImportConfirmResult {
  readonly kind: EnabledImportKind;
  readonly created: number;
  readonly failed: number;
  readonly skipped: number;
  readonly results: readonly ImportRowResult[];
}
