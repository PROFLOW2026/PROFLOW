import { and, desc, eq, sql } from 'drizzle-orm';
import { ocrCorrectionMemory } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { normalizeVendorName } from '@/modules/vendors/domain/name-matching';
import { normalizeIsraeliIdentifier } from '../domain/israeli-normalize';

export type OcrMappingKind = 'vendor' | 'project' | 'purchase_order' | 'subcontract_agreement';

export interface OcrMemoryRecord {
  readonly mappingKind: OcrMappingKind;
  readonly sourceKey: string;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly purchaseOrderId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly confirmedCount: number;
}

function sourceKeyForVendorName(name: string): string {
  return `name:${normalizeVendorName(name)}`;
}

function sourceKeyForIdentifier(value: string): string {
  return `id:${normalizeIsraeliIdentifier(value) ?? value.trim().toLowerCase()}`;
}

export async function upsertOcrCorrectionMemory(
  db: DbExecutor,
  input: {
    organizationId: string;
    mappingKind: OcrMappingKind;
    sourceKey: string;
    sourceVendorName?: string | null;
    sourceIdentifier?: string | null;
    sourceCurrency?: string | null;
    vendorId?: string | null;
    projectId?: string | null;
    purchaseOrderId?: string | null;
    subcontractAgreementId?: string | null;
    userId: string;
  },
): Promise<void> {
  if (!db || typeof (db as { insert?: unknown }).insert !== 'function') return;
  const key = input.sourceKey.trim();
  if (!key) return;

  await db
    .insert(ocrCorrectionMemory)
    .values({
      organizationId: input.organizationId,
      mappingKind: input.mappingKind,
      sourceKey: key,
      sourceVendorName: input.sourceVendorName ?? null,
      sourceIdentifier: input.sourceIdentifier ?? null,
      sourceCurrency: input.sourceCurrency ?? null,
      vendorId: input.vendorId ?? null,
      projectId: input.projectId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      subcontractAgreementId: input.subcontractAgreementId ?? null,
      confirmedCount: 1,
      lastConfirmedByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: [
        ocrCorrectionMemory.organizationId,
        ocrCorrectionMemory.mappingKind,
        ocrCorrectionMemory.sourceKey,
      ],
      set: {
        vendorId: input.vendorId ?? sql`${ocrCorrectionMemory.vendorId}`,
        projectId: input.projectId ?? sql`${ocrCorrectionMemory.projectId}`,
        purchaseOrderId: input.purchaseOrderId ?? sql`${ocrCorrectionMemory.purchaseOrderId}`,
        subcontractAgreementId:
          input.subcontractAgreementId ?? sql`${ocrCorrectionMemory.subcontractAgreementId}`,
        confirmedCount: sql`${ocrCorrectionMemory.confirmedCount} + 1`,
        lastConfirmedAt: new Date(),
        lastConfirmedByUserId: input.userId,
        updatedAt: new Date(),
      },
    });
}

export async function listOcrCorrectionMemory(
  db: DbExecutor,
  organizationId: string,
  mappingKind?: OcrMappingKind,
): Promise<OcrMemoryRecord[]> {
  if (!db || typeof (db as { select?: unknown }).select !== 'function') return [];
  const rows = await db
    .select({
      mappingKind: ocrCorrectionMemory.mappingKind,
      sourceKey: ocrCorrectionMemory.sourceKey,
      vendorId: ocrCorrectionMemory.vendorId,
      projectId: ocrCorrectionMemory.projectId,
      purchaseOrderId: ocrCorrectionMemory.purchaseOrderId,
      subcontractAgreementId: ocrCorrectionMemory.subcontractAgreementId,
      confirmedCount: ocrCorrectionMemory.confirmedCount,
    })
    .from(ocrCorrectionMemory)
    .where(
      mappingKind
        ? and(
            eq(ocrCorrectionMemory.organizationId, organizationId),
            eq(ocrCorrectionMemory.mappingKind, mappingKind),
          )
        : eq(ocrCorrectionMemory.organizationId, organizationId),
    )
    .orderBy(desc(ocrCorrectionMemory.confirmedCount))
    .limit(200);

  return rows.map((row) => ({
    mappingKind: row.mappingKind as OcrMappingKind,
    sourceKey: row.sourceKey,
    vendorId: row.vendorId,
    projectId: row.projectId,
    purchaseOrderId: row.purchaseOrderId,
    subcontractAgreementId: row.subcontractAgreementId,
    confirmedCount: row.confirmedCount,
  }));
}

export function vendorNameSourceKey(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return sourceKeyForVendorName(trimmed);
}

export function vendorIdentifierSourceKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return sourceKeyForIdentifier(trimmed);
}
