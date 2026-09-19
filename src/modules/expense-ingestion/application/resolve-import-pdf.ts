import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findImportByProviderDocument } from '../data/imports.repository';
import { resolveSumitHttpClientForOrg } from './resolve-sumit-client';

export async function resolveSumitImportPdfBytes(
  context: OrgContext,
  importId: string,
): Promise<{ bytes: Uint8Array; contentType: string; fileName: string }> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const { listImportsForOrg } = await import('../data/imports.repository');
  const imports = await listImportsForOrg(context.db, context.organizationId);
  const imp = imports.find((row) => row.id === importId);
  if (!imp) {
    throw new NotFoundError('Expense import not found');
  }
  if (imp.provider !== 'sumit') {
    throw new DomainRuleError('Unsupported import provider', 'errors.unexpected');
  }

  const client = await resolveSumitHttpClientForOrg(context);
  if (!client) {
    throw new DomainRuleError(
      'SUMIT is not connected',
      'invoicingIntegration.errors.connectionRequired',
    );
  }

  const existing = await findImportByProviderDocument(
    context.db,
    context.organizationId,
    imp.externalDocumentId,
  );
  if (!existing || existing.id !== importId) {
    throw new NotFoundError('Expense import not found');
  }

  const pdf = await client.getDocumentPdf(imp.externalDocumentId, true);
  return {
    bytes: pdf.bytes,
    contentType: pdf.contentType,
    fileName: `sumit-expense-${imp.externalDocumentId}.pdf`,
  };
}
