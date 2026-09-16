import type { ReportKind } from '@/modules/reports';

export const GENERATED_DOCUMENT_CATEGORY = 'generated_pdf';

export interface GeneratedDocumentTags {
  readonly pfGenerated: true;
  readonly generatedKind: ReportKind;
  readonly sourceEntityType: string;
  readonly sourceEntityId: string;
  readonly reportMonth?: string | null;
  readonly version: number;
  readonly idempotencyKey?: string | null;
  readonly generatedAt: string;
}

export function serializeGeneratedDocumentTags(tags: GeneratedDocumentTags): string {
  return JSON.stringify(tags);
}

export function parseGeneratedDocumentTags(raw: string | null | undefined): GeneratedDocumentTags | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratedDocumentTags>;
    if (parsed.pfGenerated !== true || !parsed.generatedKind || !parsed.sourceEntityType || !parsed.sourceEntityId) {
      return null;
    }
    return {
      pfGenerated: true,
      generatedKind: parsed.generatedKind as ReportKind,
      sourceEntityType: parsed.sourceEntityType,
      sourceEntityId: parsed.sourceEntityId,
      reportMonth: parsed.reportMonth ?? null,
      version: typeof parsed.version === 'number' && parsed.version > 0 ? parsed.version : 1,
      idempotencyKey: parsed.idempotencyKey ?? null,
      generatedAt: parsed.generatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function generatedArtifactKey(input: {
  readonly generatedKind: ReportKind;
  readonly sourceEntityId: string;
  readonly reportMonth?: string | null;
}): string {
  if (input.reportMonth) {
    return `${input.generatedKind}:${input.reportMonth}`;
  }
  return `${input.generatedKind}:${input.sourceEntityId}`;
}
