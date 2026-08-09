/** Catalog / domain rows for organization settings (framework-free). */
export interface OrganizationDomainRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
}
