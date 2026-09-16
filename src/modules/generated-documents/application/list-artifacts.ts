import 'server-only';

import { listDocumentsForEntity } from '@/modules/documents';
import type { DocumentOwnerType } from '@/modules/documents';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ReportKind } from '@/modules/reports';
import {
  GENERATED_DOCUMENT_CATEGORY,
  generatedArtifactKey,
  parseGeneratedDocumentTags,
} from '../domain/tags';
import type { GeneratedArtifactSummary } from '../domain/types';

export async function listGeneratedArtifacts(
  context: OrgContext,
  input: {
    readonly ownerType: DocumentOwnerType;
    readonly ownerId: string;
    readonly generatedKind: ReportKind;
    readonly sourceEntityId: string;
    readonly reportMonth?: string | null;
  },
): Promise<readonly GeneratedArtifactSummary[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const docs = await listDocumentsForEntity(context.db, context.organizationId, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
  });

  const key = generatedArtifactKey({
    generatedKind: input.generatedKind,
    sourceEntityId: input.sourceEntityId,
    reportMonth: input.reportMonth,
  });

  const matches = docs
    .filter((doc) => doc.status === 'available' && doc.category === GENERATED_DOCUMENT_CATEGORY)
    .map((doc) => {
      const tags = parseGeneratedDocumentTags(doc.tags);
      if (!tags) return null;
      const docKey = generatedArtifactKey({
        generatedKind: tags.generatedKind,
        sourceEntityId: tags.sourceEntityId,
        reportMonth: tags.reportMonth,
      });
      if (docKey !== key) return null;
      return {
        documentId: doc.id,
        fileName: doc.originalFilename,
        version: tags.version,
        generatedAt: tags.generatedAt,
        externalFileId: doc.externalFileId,
        connectionId: doc.externalConnectionId,
      } satisfies GeneratedArtifactSummary;
    })
    .filter((row): row is GeneratedArtifactSummary => row !== null);

  return matches.sort((a, b) => b.version - a.version || b.generatedAt.localeCompare(a.generatedAt));
}

export function nextGeneratedVersion(existing: readonly GeneratedArtifactSummary[]): number {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((item) => item.version)) + 1;
}
