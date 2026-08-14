/**
 * Deep-link into an existing org reports section (`?section=`).
 * Not a second analytics engine — ids match ReportsAnalyticsView headings.
 */

export const REPORT_SECTIONS = [
  'commercial',
  'cash',
  'cost',
  'profitability',
  'operations',
  'comparison',
] as const;

export type ReportsSection = (typeof REPORT_SECTIONS)[number];

export function parseReportsSection(
  value: ReportsSection | string | null | undefined,
): ReportsSection | null {
  if (value && (REPORT_SECTIONS as readonly string[]).includes(value)) {
    return value as ReportsSection;
  }
  return null;
}

export function reportsHref(options: {
  readonly section?: ReportsSection | null;
  readonly workKind?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.workKind && options.workKind !== 'all') {
    params.set('workKind', options.workKind);
  }
  if (options.section) params.set('section', options.section);
  const query = params.toString();
  return query ? `/reports?${query}` : '/reports';
}
