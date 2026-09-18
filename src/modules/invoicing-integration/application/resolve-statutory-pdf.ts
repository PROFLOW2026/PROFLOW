import 'server-only';

import { createHash } from 'node:crypto';
import { findDocumentById } from '@/modules/documents';
import { getExternalDocumentDownload } from '@/modules/external-storage/server';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument } from '../data/external-documents';
import { buildStatutoryPdfFileName } from '../domain/statutory-pdf-filename';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';

export interface ResolvedStatutoryPdf {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly fileName: string;
  readonly checksumSha256: string;
  readonly source: 'storage' | 'sumit';
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function checksumSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function resolveStatutoryPdfBytes(
  context: OrgContext,
  externalDocumentId: string,
): Promise<ResolvedStatutoryPdf> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const doc = await findExternalDocument(context, externalDocumentId);
  if (!doc) throw new NotFoundError('ExternalStatutoryDocument');
  if (!doc.externalId) {
    throw new DomainRuleError(
      'External document has no provider id',
      'invoicingIntegration.errors.missingExternalId',
    );
  }
  if (doc.issuanceOutcome !== 'confirmed_created') {
    throw new DomainRuleError(
      'Statutory document is not issued',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  const fileName = doc.pdf?.fileName ?? buildStatutoryPdfFileName(doc.externalNumber);

  if (doc.pdf?.storageDocumentId) {
    const stored = await findDocumentById(
      context.db,
      context.organizationId,
      doc.pdf.storageDocumentId,
    );
    if (stored?.status === 'available') {
      const payload = await getExternalDocumentDownload(context, doc.pdf.storageDocumentId);
      if ('stream' in payload) {
        const bytes = await streamToBytes(payload.stream);
        return {
          bytes,
          contentType: payload.mimeType,
          fileName: payload.filename || fileName,
          checksumSha256: checksumSha256(bytes),
          source: 'storage',
        };
      }
      const response = await fetch(payload.url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        contentType: payload.mimeType,
        fileName: payload.filename || fileName,
        checksumSha256: checksumSha256(bytes),
        source: 'storage',
      };
    }
  }

  if (doc.providerId !== SUMIT_PROVIDER_ID) {
    throw new DomainRuleError(
      'PDF fetch is not supported for this provider',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  const provider = await resolveStatutoryProviderForOrg(context);
  if (!(provider instanceof SumitStatutoryProvider) || !provider.isConfigured()) {
    throw new DomainRuleError(
      'SUMIT provider is not configured',
      'invoicingIntegration.errors.connectionRequired',
    );
  }

  const pdf = await provider.fetchDocumentPdf(doc.externalId);
  return {
    bytes: pdf.bytes,
    contentType: pdf.contentType,
    fileName,
    checksumSha256: checksumSha256(pdf.bytes),
    source: 'sumit',
  };
}
