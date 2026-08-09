import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { complianceArtifacts } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ArtifactKind,
  ArtifactStatus,
  ComplianceArtifactRecord,
  ComplianceListFilters,
  SubjectType,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapArtifact(row: typeof complianceArtifacts.$inferSelect): ComplianceArtifactRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    artifactKind: row.artifactKind as ArtifactKind,
    name: row.name,
    referenceNumber: row.referenceNumber,
    issuer: row.issuer,
    issuedOn: asDateString(row.issuedOn),
    expiresOn: asDateString(row.expiresOn),
    status: row.status as ArtifactStatus,
    subjectType: row.subjectType as SubjectType,
    subjectId: row.subjectId,
    documentId: row.documentId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertComplianceArtifact(
  db: DbExecutor,
  input: {
    organizationId: string;
    artifactKind: ArtifactKind;
    name: string;
    referenceNumber?: string | null;
    issuer?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    status: ArtifactStatus;
    subjectType: SubjectType;
    subjectId?: string | null;
    notes?: string | null;
  },
): Promise<ComplianceArtifactRecord> {
  const [row] = await db
    .insert(complianceArtifacts)
    .values({
      organizationId: input.organizationId,
      artifactKind: input.artifactKind,
      name: input.name,
      referenceNumber: input.referenceNumber ?? null,
      issuer: input.issuer ?? null,
      issuedOn: input.issuedOn ?? null,
      expiresOn: input.expiresOn ?? null,
      status: input.status,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      documentId: null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapArtifact(row!);
}

export async function updateComplianceArtifactById(
  db: DbExecutor,
  organizationId: string,
  artifactId: string,
  patch: Partial<{
    artifactKind: ArtifactKind;
    name: string;
    referenceNumber: string | null;
    issuer: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    status: ArtifactStatus;
    subjectType: SubjectType;
    subjectId: string | null;
    documentId: string | null;
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<ComplianceArtifactRecord | null> {
  const [row] = await db
    .update(complianceArtifacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(complianceArtifacts.id, artifactId), eq(complianceArtifacts.organizationId, organizationId)),
    )
    .returning();

  return row ? mapArtifact(row) : null;
}

export async function findComplianceArtifactById(
  db: DbExecutor,
  organizationId: string,
  artifactId: string,
): Promise<ComplianceArtifactRecord | null> {
  const [row] = await db
    .select()
    .from(complianceArtifacts)
    .where(
      and(eq(complianceArtifacts.id, artifactId), eq(complianceArtifacts.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapArtifact(row) : null;
}

export async function listComplianceArtifacts(
  db: DbExecutor,
  organizationId: string,
  filters: ComplianceListFilters = {},
): Promise<ComplianceArtifactRecord[]> {
  const conditions = [eq(complianceArtifacts.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(complianceArtifacts.archivedAt));
  }

  if (filters.kind && filters.kind !== 'all') {
    conditions.push(eq(complianceArtifacts.artifactKind, filters.kind));
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(complianceArtifacts.status, filters.status));
  }

  if (filters.subjectType && filters.subjectType !== 'all') {
    conditions.push(eq(complianceArtifacts.subjectType, filters.subjectType));
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(complianceArtifacts.name, term),
        ilike(complianceArtifacts.referenceNumber, term),
        ilike(complianceArtifacts.issuer, term),
        ilike(complianceArtifacts.notes, term),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(complianceArtifacts)
    .where(and(...conditions))
    .orderBy(desc(complianceArtifacts.expiresOn), complianceArtifacts.name)
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));

  return rows.map(mapArtifact);
}
