import type { ReportKind } from './types';

export function reportDownloadPath(kind: ReportKind, id: string): string {
  const params = new URLSearchParams({ kind, id });
  return `/reports/download?${params.toString()}`;
}

export function reportPreviewPath(kind: ReportKind, id: string): string {
  const params = new URLSearchParams({ kind, id });
  return `/reports/preview?${params.toString()}`;
}

export function reportFilename(kind: ReportKind, generatedAt: Date): string {
  const day = generatedAt.toISOString().slice(0, 10);
  return `${kind}-${day}.pdf`;
}
